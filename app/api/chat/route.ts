import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { systemPromptForMode } from "@/lib/modes";
import {
  ApiValidationError,
  enforceMemoryRateLimit,
  getFriendlyApiError,
  normalizeMessages,
  requireOwnerId,
  validateMode,
  validateModel
} from "@/lib/api-guards";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const openai = new OpenAI({
  apiKey: openaiKey
});

const anthropic = new Anthropic({
  apiKey: anthropicKey
});

const GUEST_CHAT_LIMIT = 50;
const USER_CHAT_LIMIT = 500;
const DAILY_CHAT_LIMIT = 20;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AnthropicChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function incrementChatUsage(ownerId: string) {
  const { data: existing } = await supabaseAdmin
    .from("usage_counts")
    .select("owner_id, chat_count")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("usage_counts").insert({
      owner_id: ownerId,
      chat_count: 1,
      image_count: 0
    });
    return { count: 1 };
  }

  const nextCount = (existing.chat_count || 0) + 1;

  await supabaseAdmin
    .from("usage_counts")
    .update({
      chat_count: nextCount,
      updated_at: new Date().toISOString()
    })
    .eq("owner_id", ownerId);

  return { count: nextCount };
}

async function incrementDailyChatUsage(ownerId: string) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabaseAdmin
    .from("usage_daily")
    .select("owner_id, usage_date, chat_count")
    .eq("owner_id", ownerId)
    .eq("usage_date", today)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("usage_daily").insert({
      owner_id: ownerId,
      usage_date: today,
      chat_count: 1,
      image_count: 0
    });

    return { count: 1 };
  }

  const nextCount = (existing.chat_count || 0) + 1;

  await supabaseAdmin
    .from("usage_daily")
    .update({
      chat_count: nextCount
    })
    .eq("owner_id", ownerId)
    .eq("usage_date", today);

  return { count: nextCount };
}

function toAnthropicMessages(messages: ChatMessage[]): AnthropicChatMessage[] {
  return messages.flatMap((m): AnthropicChatMessage[] => {
    if (m.role === "user" || m.role === "assistant") {
      return [
        {
          role: m.role,
          content: m.content
        }
      ];
    }
    return [];
  });
}

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((m) => m.role === "user")?.content || "";
}

function shouldUseLiveWebSearch(text: string) {
  const q = text.toLowerCase().trim();

  const liveKeywords = [
    "weather",
    "temperature",
    "forecast",
    "news",
    "today",
    "current",
    "currently",
    "latest",
    "recent",
    "recently",
    "stock",
    "share price",
    "market",
    "score",
    "match",
    "game",
    "flight",
    "traffic",
    "live",
    "update",
    "updates",
    "breaking",
    "what is happening",
    "who is the current",
    "who won",
    "bitcoin price",
    "ethereum price"
  ];

  return liveKeywords.some((k) => q.includes(k));
}

function buildOpenAIInput(messages: ChatMessage[], systemPrompt: string) {
  const compactMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: m.content
    }));

  const lines: string[] = [];
  lines.push(`SYSTEM: ${systemPrompt}`);
  lines.push("");

  for (const m of compactMessages) {
    lines.push(`${m.role.toUpperCase()}: ${m.content}`);
    lines.push("");
  }

  lines.push(
    "Answer the latest user request helpfully. If current/live information is needed and web search is available, use it."
  );

  return lines.join("\n");
}

async function ensureChatOwnership(
  activeChatId: string,
  ownerId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: existingChat, error: existingChatError } = await supabaseAdmin
    .from("chats")
    .select("id, user_id")
    .eq("id", activeChatId)
    .single();

  if (existingChatError || !existingChat) {
    return { ok: false, status: 404, error: "Chat not found." };
  }

  if (existingChat.user_id !== ownerId) {
    return { ok: false, status: 403, error: "Unauthorized chat access." };
  }

  return { ok: true };
}

async function createChatIfNeeded(
  activeChatId: string | null,
  ownerId: string,
  normalizedMessages: ChatMessage[]
): Promise<{ chatId: string } | { error: string; status: number }> {
  if (activeChatId) {
    return { chatId: activeChatId };
  }

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
    return {
      error: chatError?.message || "Failed to create chat.",
      status: 500
    };
  }

  return { chatId: newChat.id };
}

async function saveUserMessageIfNeeded(
  activeChatId: string,
  latestUserMessage: string
) {
  if (!latestUserMessage.trim()) return;

  const { data: lastMessage } = await supabaseAdmin
    .from("messages")
    .select("role, content")
    .eq("chat_id", activeChatId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    lastMessage?.role === "user" &&
    lastMessage.content.trim() === latestUserMessage.trim()
  ) {
    return;
  }

  await supabaseAdmin.from("messages").insert({
    chat_id: activeChatId,
    role: "user",
    content: latestUserMessage
  });
}

async function saveAssistantMessage(
  activeChatId: string,
  assistantReply: string
) {
  if (!assistantReply.trim()) return;

  await supabaseAdmin.from("messages").insert({
    chat_id: activeChatId,
    role: "assistant",
    content: assistantReply
  });
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
      mode = "general",
      model = "openai",
      userId = null,
      guestId = null,
      chatId = null
    } = body;

    const ownerId = requireOwnerId(userId, guestId);
    const normalizedMessages = normalizeMessages(messages) as ChatMessage[];
    const validatedMode = validateMode(mode);
    const validatedModel = validateModel(model);

    enforceMemoryRateLimit({
      key: `chat:${ownerId}`,
      limit: 10,
      windowMs: 60_000
    });

    const usage = await incrementChatUsage(ownerId);
    const dailyUsage = await incrementDailyChatUsage(ownerId);
    const limit = userId ? USER_CHAT_LIMIT : GUEST_CHAT_LIMIT;

    if (usage.count > limit) {
      return NextResponse.json(
        { error: `Chat usage limit reached (${limit}).` },
        { status: 403 }
      );
    }

    if (dailyUsage.count > DAILY_CHAT_LIMIT) {
      return NextResponse.json(
        {
          error: `Free plan limit reached. You can send up to ${DAILY_CHAT_LIMIT} messages per day.`
        },
        { status: 403 }
      );
    }

    let activeChatId = chatId as string | null;

    if (activeChatId) {
      const ownership = await ensureChatOwnership(activeChatId, ownerId);
      if (!ownership.ok) {
        return NextResponse.json(
          { error: ownership.error },
          { status: ownership.status }
        );
      }
    }

    const created = await createChatIfNeeded(
      activeChatId,
      ownerId,
      normalizedMessages
    );

    if ("error" in created) {
      return NextResponse.json(
        { error: created.error },
        { status: created.status }
      );
    }

    activeChatId = created.chatId;

    const latestUserMessage = getLatestUserMessage(normalizedMessages);
    const systemPrompt = systemPromptForMode(validatedMode as never);

    await saveUserMessageIfNeeded(activeChatId, latestUserMessage);

    if (validatedModel === "claude") {
      if (!anthropicKey) {
        return NextResponse.json(
          { error: "Claude is not configured on the server." },
          { status: 500 }
        );
      }

      const anthropicMessages = toAnthropicMessages(normalizedMessages);

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        temperature: 0.7,
        system: systemPrompt,
        messages: anthropicMessages
      });

      const assistantReply =
        response.content
          .map((block) => {
            if (block.type === "text") return block.text;
            return "";
          })
          .join("")
          .trim() || "No response.";

      await saveAssistantMessage(activeChatId, assistantReply);

      return NextResponse.json(
        {
          reply: assistantReply,
          chatId: activeChatId
        },
        {
          headers: {
            "X-Chat-Id": String(activeChatId)
          }
        }
      );
    }

    const useLiveWeb = shouldUseLiveWebSearch(latestUserMessage);

    const openaiResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: buildOpenAIInput(normalizedMessages, systemPrompt),
      tools: useLiveWeb ? [{ type: "web_search_preview" }] : []
    });

    const assistantReply = (openaiResponse.output_text || "No response.").trim();

    await saveAssistantMessage(activeChatId, assistantReply);

    return NextResponse.json(
      {
        reply: assistantReply,
        chatId: activeChatId,
        liveDataUsed: useLiveWeb
      },
      {
        headers: {
          "X-Chat-Id": String(activeChatId)
        }
      }
    );
  } catch (error) {
    console.error("POST /api/chat error:", error);

    const friendly = getFriendlyApiError(
      error,
      "We could not process that message right now. Please try again."
    );

    return NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
  }
}
