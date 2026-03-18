import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openaiKey = process.env.OPENAI_API_KEY!;

const GUEST_IMAGE_LIMIT = 20;
const USER_IMAGE_LIMIT = 200;

async function incrementImageUsage(ownerId: string) {
  const { data: existing } = await supabase
    .from("usage_counts")
    .select("owner_id, image_count")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("usage_counts").insert({
      owner_id: ownerId,
      chat_count: 0,
      image_count: 1
    });
    return { count: 1 };
  }

  const nextCount = (existing.image_count || 0) + 1;

  await supabase
    .from("usage_counts")
    .update({
      image_count: nextCount,
      updated_at: new Date().toISOString()
    })
    .eq("owner_id", ownerId);

  return { count: nextCount };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, guestId = null, userId = null, chatId = null } = body;

    const ownerId = userId || guestId;

    if (!ownerId) {
      return NextResponse.json(
        { error: "Missing userId or guestId." },
        { status: 400 }
      );
    }

    const usage = await incrementImageUsage(ownerId);
    const limit = userId ? USER_IMAGE_LIMIT : GUEST_IMAGE_LIMIT;

    if (usage.count > limit) {
      return NextResponse.json(
        { error: `Image usage limit reached (${limit}).` },
        { status: 403 }
      );
    }

    const prompt =
      messages?.[messages.length - 1]?.content || "A creative image";

    let activeChatId = chatId;

    if (!activeChatId) {
      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({
          user_id: ownerId,
          title: String(prompt).slice(0, 50)
        })
        .select()
        .single();

      if (chatError || !newChat) {
        return NextResponse.json(
          { error: chatError?.message || "Failed to create image chat." },
          { status: 500 }
        );
      }

      activeChatId = newChat.id;
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Image generation failed." },
        { status: 500 }
      );
    }

    const imageUrl =
      data?.data?.[0]?.url ||
      `data:image/png;base64,${data?.data?.[0]?.b64_json || ""}`;

    await supabase.from("messages").insert([
      {
        chat_id: activeChatId,
        role: "user",
        content: prompt
      },
      {
        chat_id: activeChatId,
        role: "assistant",
        content: imageUrl
      }
    ]);

    return NextResponse.json({
      url: imageUrl,
      chatId: activeChatId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Image generation failed."
      },
      { status: 500 }
    );
  }
}