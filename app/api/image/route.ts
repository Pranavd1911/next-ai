import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  enforceMemoryRateLimit,
  getFriendlyApiError,
  normalizeMessages,
  requireOwnerId
} from "@/lib/api-guards";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const openai = new OpenAI({
  apiKey: openaiKey
});

const GUEST_IMAGE_LIMIT = 10;
const USER_IMAGE_LIMIT = 100;
const DAILY_IMAGE_LIMIT = 5;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function incrementImageUsage(ownerId: string) {
  const { data: existing } = await supabaseAdmin
    .from("usage_counts")
    .select("owner_id, image_count")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("usage_counts").insert({
      owner_id: ownerId,
      chat_count: 0,
      image_count: 1
    });
    return { count: 1 };
  }

  const nextCount = (existing.image_count || 0) + 1;

  await supabaseAdmin
    .from("usage_counts")
    .update({
      image_count: nextCount,
      updated_at: new Date().toISOString()
    })
    .eq("owner_id", ownerId);

  return { count: nextCount };
}

async function incrementDailyImageUsage(ownerId: string) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabaseAdmin
    .from("usage_daily")
    .select("owner_id, usage_date, image_count")
    .eq("owner_id", ownerId)
    .eq("usage_date", today)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("usage_daily").insert({
      owner_id: ownerId,
      usage_date: today,
      chat_count: 0,
      image_count: 1
    });

    return { count: 1 };
  }

  const nextCount = (existing.image_count || 0) + 1;

  await supabaseAdmin
    .from("usage_daily")
    .update({
      image_count: nextCount
    })
    .eq("owner_id", ownerId)
    .eq("usage_date", today);

  return { count: nextCount };
}

function buildImagePrompt(messages: ChatMessage[]) {
  const latestUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || "";

  if (!latestUserMessage) {
    return "Create a high-quality digital illustration.";
  }

  return latestUserMessage;
}

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
      return NextResponse.json(
        { error: "Missing required environment variables." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const {
      messages,
      userId = null,
      guestId = null,
      chatId = null
    } = body;

    const ownerId = requireOwnerId(userId, guestId);
    const normalizedMessages = normalizeMessages(messages) as ChatMessage[];

    enforceMemoryRateLimit({
      key: `image:${ownerId}`,
      limit: 4,
      windowMs: 60_000
    });

    const usage = await incrementImageUsage(ownerId);
    const dailyUsage = await incrementDailyImageUsage(ownerId);
    const limit = userId ? USER_IMAGE_LIMIT : GUEST_IMAGE_LIMIT;

    if (usage.count > limit) {
      return NextResponse.json(
        { error: `Image usage limit reached (${limit}).` },
        { status: 403 }
      );
    }

    if (dailyUsage.count > DAILY_IMAGE_LIMIT) {
      return NextResponse.json(
        {
          error: `Daily image limit reached. You can generate up to ${DAILY_IMAGE_LIMIT} images per day.`
        },
        { status: 403 }
      );
    }

    let activeChatId = chatId as string | null;

    if (activeChatId) {
      const { data: existingChat, error: existingChatError } = await supabaseAdmin
        .from("chats")
        .select("id, user_id")
        .eq("id", activeChatId)
        .single();

      if (existingChatError || !existingChat) {
        return NextResponse.json(
          { error: "Chat not found." },
          { status: 404 }
        );
      }

      if (existingChat.user_id !== ownerId) {
        return NextResponse.json(
          { error: "Unauthorized chat access." },
          { status: 403 }
        );
      }
    }

    if (!activeChatId) {
      const firstUserMessage =
        normalizedMessages.find((m) => m.role === "user")?.content || "New Chat";

      const { data: newChat, error: chatError } = await supabaseAdmin
        .from("chats")
        .insert({
          user_id: ownerId,
          title: String(firstUserMessage).slice(0, 50)
        })
        .select()
        .single();

      if (chatError || !newChat) {
        return NextResponse.json(
          { error: chatError?.message || "Failed to create chat." },
          { status: 500 }
        );
      }

      activeChatId = newChat.id;
    }

    const prompt = buildImagePrompt(normalizedMessages);
    const latestUserMessage =
      [...normalizedMessages].reverse().find((m) => m.role === "user")?.content || prompt;

    const imageResponse = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    });

    const firstImage = imageResponse.data?.[0];
    const imageBase64 = firstImage?.b64_json;
    const imageUrl = firstImage?.url;

    let finalImageUrl = "";

    if (imageBase64) {
      finalImageUrl = `data:image/png;base64,${imageBase64}`;
    } else if (imageUrl) {
      finalImageUrl = imageUrl;
    }

    if (!finalImageUrl) {
      return NextResponse.json(
        { error: "Image generation failed." },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabaseAdmin.from("messages").insert([
      {
        chat_id: activeChatId,
        role: "user",
        content: latestUserMessage
      },
      {
        chat_id: activeChatId,
        role: "assistant",
        content: finalImageUrl
      }
    ]);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || "Failed to save image chat." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: finalImageUrl,
      chatId: activeChatId
    });
  } catch (error) {
    console.error("POST /api/image error:", error);

    const friendly = getFriendlyApiError(
      error,
      "Image generation is unavailable right now. Please try again."
    );

    return NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
  }
}
