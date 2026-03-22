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
import { getUserPreferences, trackAnalyticsEvent } from "@/lib/server-data";

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

const DAILY_CHAT_LIMIT = 20;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AnthropicChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RawFileMessage = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  extractedText: string;
  extractionStatus: string;
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

function parseRawFileMessage(content: string): RawFileMessage | null {
  if (!content.startsWith("FILETEXT::")) return null;

  const parts = content.split("::");
  if (parts.length < 6) return null;

  return {
    fileName: decodeURIComponent(parts[1] || ""),
    fileUrl: decodeURIComponent(parts[2] || ""),
    mimeType: decodeURIComponent(parts[3] || ""),
    extractedText: decodeURIComponent(parts[4] || ""),
    extractionStatus: decodeURIComponent(parts[5] || "")
  };
}

function detectAgentProfile(params: {
  latestUserMessage: string;
  codeModeEnabled: boolean;
  rawMessages: unknown;
}) {
  const text = params.latestUserMessage.toLowerCase();

  if (params.codeModeEnabled) return "coding";

  const codingKeywords = [
    "code",
    "debug",
    "bug",
    "typescript",
    "javascript",
    "python",
    "react",
    "next.js",
    "api",
    "sql",
    "fix this code"
  ];

  if (codingKeywords.some((keyword) => text.includes(keyword))) {
    return "coding";
  }

  const researchKeywords = [
    "latest",
    "current",
    "recent",
    "news",
    "research",
    "compare",
    "market",
    "trend"
  ];

  if (researchKeywords.some((keyword) => text.includes(keyword))) {
    return "research";
  }

  const rawMessageList = Array.isArray(params.rawMessages) ? params.rawMessages : [];
  const hasUploadedImage = rawMessageList.some((message) => {
    if (!message || typeof message !== "object") return false;
    const content =
      typeof (message as { content?: unknown }).content === "string"
        ? ((message as { content: string }).content)
        : "";
    const parsed = parseRawFileMessage(content);
    return !!parsed && parsed.mimeType.startsWith("image/");
  });

  if (
    hasUploadedImage &&
    ["image", "photo", "picture", "solve", "question", "diagram", "explain this"].some(
      (keyword) => text.includes(keyword)
    )
  ) {
    return "vision";
  }

  return "general";
}

function buildAgentInstructions(agentProfile: string) {
  switch (agentProfile) {
    case "coding":
      return "You are the Coding Agent. Prioritize implementation, debugging, correctness, and minimal theory.";
    case "research":
      return "You are the Research Agent. Prioritize up-to-date reasoning, comparisons, and evidence-aware answers.";
    case "vision":
      return "You are the Vision Agent. Analyze uploaded images carefully, explain what is visible, and solve questions shown in photos when possible.";
    default:
      return "You are the General Agent. Be direct, helpful, and practical.";
  }
}

function buildVisionInput(params: {
  rawMessages: unknown;
  latestUserMessage: string;
  systemPrompt: string;
}) {
  const rawMessageList = Array.isArray(params.rawMessages) ? params.rawMessages : [];
  const latestImages = rawMessageList
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const content =
        typeof (message as { content?: unknown }).content === "string"
          ? ((message as { content: string }).content)
          : "";
      return parseRawFileMessage(content);
    })
    .filter((file): file is RawFileMessage => !!file && file.mimeType.startsWith("image/"))
    .slice(-2);

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: [
        params.systemPrompt,
        "",
        "Analyze the uploaded image(s) and answer the user's request directly.",
        `User request: ${params.latestUserMessage}`
      ].join("\n")
    }
  ];

  for (const image of latestImages) {
    content.push({
      type: "input_image",
      image_url: image.fileUrl,
      detail: "high"
    });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

function buildPreferenceInstructions(params: {
  memory: string;
  codeModeEnabled: boolean;
  prefersDirectAnswers: boolean;
}) {
  const lines: string[] = [];

  if (params.memory.trim()) {
    lines.push("Remembered user context:");
    lines.push(params.memory.trim());
    lines.push("");
  }

  if (params.codeModeEnabled) {
    lines.push("Code Mode is ON.");
    lines.push("Prioritize code, debugging, architecture, and implementation details.");
    lines.push("");
  }

  if (params.prefersDirectAnswers) {
    lines.push("Answer directly.");
    lines.push("Keep formatting clean, minimal, and low-noise.");
    lines.push("Do not add unnecessary markdown headings or filler.");
  }

  return lines.join("\n");
}

function extractRememberableMemory(message: string) {
  const text = message.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();

  if (!text || text.length > 220) return null;

  const explicitRememberPrefixes = [
    "remember this about me",
    "remember that",
    "remember i am",
    "remember i'm",
    "please remember",
    "for future chats remember"
  ];

  if (explicitRememberPrefixes.some((prefix) => lower.startsWith(prefix))) {
    return text;
  }

  const personalContextPrefixes = [
    "i am ",
    "i'm ",
    "my name is ",
    "i work as ",
    "i work at ",
    "i study ",
    "i am a ",
    "i am an ",
    "i prefer ",
    "my goal is ",
    "my goals are "
  ];

  if (personalContextPrefixes.some((prefix) => lower.startsWith(prefix))) {
    return text;
  }

  return null;
}

async function rememberUserContext(ownerId: string, latestUserMessage: string) {
  const memoryCandidate = extractRememberableMemory(latestUserMessage);
  if (!memoryCandidate) return null;

  const existing = await getUserPreferences(ownerId);
  const lines = existing.memory
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const alreadySaved = lines.some(
    (line) => line.toLowerCase() === memoryCandidate.toLowerCase()
  );

  if (alreadySaved) {
    return existing.memory;
  }

  const nextMemory = [...lines, memoryCandidate].join("\n").slice(0, 2000);

  await supabaseAdmin.from("user_preferences").upsert({
    owner_id: ownerId,
    memory: nextMemory,
    prefers_direct_answers: existing.prefers_direct_answers,
    web_search_enabled: existing.web_search_enabled,
    code_mode_enabled: existing.code_mode_enabled,
    updated_at: new Date().toISOString()
  });

  return nextMemory;
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

function createSseEvent(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
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
      chatId = null,
      memory = "",
      webSearchEnabled = true,
      codeModeEnabled = false,
      prefersDirectAnswers = true,
      rawMessages = null,
      fullVoiceMode = false
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

    await incrementChatUsage(ownerId);
    const dailyUsage = await incrementDailyChatUsage(ownerId);

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
    const autoRememberedMemory = await rememberUserContext(
      ownerId,
      latestUserMessage
    );
    const savedPreferences = await getUserPreferences(ownerId);
    const effectiveMemory =
      typeof memory === "string" && memory.trim().length > 0
        ? memory.trim()
        : autoRememberedMemory || savedPreferences.memory || "";
    const effectiveCodeMode =
      typeof codeModeEnabled === "boolean"
        ? codeModeEnabled
        : savedPreferences.code_mode_enabled;
    const effectiveDirectAnswers =
      typeof prefersDirectAnswers === "boolean"
        ? prefersDirectAnswers
        : savedPreferences.prefers_direct_answers;
    const effectiveWebSearch =
      typeof webSearchEnabled === "boolean"
        ? webSearchEnabled
        : savedPreferences.web_search_enabled;
    const agentProfile = detectAgentProfile({
      latestUserMessage,
      codeModeEnabled: effectiveCodeMode,
      rawMessages
    });
    const systemPrompt = [
      systemPromptForMode(validatedMode as never),
      buildAgentInstructions(agentProfile),
      buildPreferenceInstructions({
        memory: effectiveMemory,
        codeModeEnabled: effectiveCodeMode,
        prefersDirectAnswers: effectiveDirectAnswers
      })
    ]
      .filter(Boolean)
      .join("\n\n");

    await saveUserMessageIfNeeded(activeChatId, latestUserMessage);
    await trackAnalyticsEvent({
      ownerId,
      eventName: "chat_request",
      chatId: activeChatId,
        metadata: {
          model: validatedModel,
          mode: validatedMode,
          agentProfile,
          webSearchEnabled: effectiveWebSearch,
          codeModeEnabled: effectiveCodeMode,
          fullVoiceMode
        }
      });

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
      await trackAnalyticsEvent({
        ownerId,
        eventName: "chat_success",
        chatId: activeChatId,
        metadata: {
            model: validatedModel,
            mode: validatedMode,
            agentProfile
          }
        });

      return NextResponse.json(
        {
          reply: assistantReply,
          chatId: activeChatId,
          rememberedMemory: effectiveMemory
        },
        {
          headers: {
            "X-Chat-Id": String(activeChatId)
          }
        }
      );
    }

    const useLiveWeb = effectiveWebSearch && shouldUseLiveWebSearch(latestUserMessage);
    const encoder = new TextEncoder();

    const responseStream = await openai.responses.create(
      {
        model: "gpt-4.1-mini",
        input:
          agentProfile === "vision"
            ? buildVisionInput({
                rawMessages,
                latestUserMessage,
                systemPrompt
              }) as any
            : buildOpenAIInput(normalizedMessages, systemPrompt),
        tools: useLiveWeb ? [{ type: "web_search_preview" }] : [],
        stream: true
      },
      {
        signal: req.signal
      }
    );

    let assistantReply = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            createSseEvent("meta", {
              chatId: activeChatId,
              liveDataUsed: useLiveWeb,
              rememberedMemory: effectiveMemory,
              agentProfile
            })
          )
        );

        try {
          for await (const event of responseStream) {
            if (event.type === "response.output_text.delta") {
              const delta = event.delta || "";
              if (!delta) continue;
              assistantReply += delta;
              controller.enqueue(
                encoder.encode(createSseEvent("delta", { delta }))
              );
            }
          }

          const finalReply = assistantReply.trim() || "No response.";
          await saveAssistantMessage(activeChatId, finalReply);
          await trackAnalyticsEvent({
            ownerId,
            eventName: "chat_success",
            chatId: activeChatId,
            metadata: {
              model: validatedModel,
              mode: validatedMode,
              liveDataUsed: useLiveWeb
            }
          });

          controller.enqueue(
            encoder.encode(
              createSseEvent("done", {
                reply: finalReply,
                chatId: activeChatId,
                liveDataUsed: useLiveWeb,
                rememberedMemory: effectiveMemory,
                agentProfile
              })
            )
          );
        } catch (streamError) {
          console.error("OpenAI streaming error:", streamError);
          await trackAnalyticsEvent({
            ownerId,
            eventName: "chat_error",
            chatId: activeChatId,
            metadata: {
              reason:
                streamError instanceof Error
                  ? streamError.message
                  : "Streaming failure"
            }
          });
          controller.enqueue(
            encoder.encode(
              createSseEvent("error", {
                error: "Streaming failed. Please try again."
              })
            )
          );
        } finally {
          controller.close();
        }
      },
      cancel() {
        if ("controller" in responseStream && responseStream.controller) {
          responseStream.controller.abort();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Chat-Id": String(activeChatId)
      }
    });
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
