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
import {
  createMemoryItem,
  enforceDistributedRateLimit,
  getUserPreferences,
  resolveRequestOwnerId,
  trackAnalyticsEvent
} from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";
import {
  deriveChatTitleFromMessage,
  parseFileMessage as parseSharedFileMessage
} from "@/lib/file-messages";

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
  return parseSharedFileMessage(content);
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
    [
      "image",
      "photo",
      "picture",
      "solve",
      "question",
      "diagram",
      "explain this",
      "what is this",
      "what's this",
      "identify"
    ].some((keyword) => text.includes(keyword))
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
  const savedItem = await createMemoryItem(ownerId, memoryCandidate);
  const updatedPreferences = await getUserPreferences(ownerId);
  return savedItem ? updatedPreferences.memory : updatedPreferences.memory;
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
  const chatTitle = deriveChatTitleFromMessage(firstUserMessage);

  const { data: newChat, error: chatError } = await supabaseAdmin
    .from("chats")
    .insert({
      user_id: ownerId,
      title: chatTitle
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
  assistantReply: string,
  metadata?: Record<string, unknown>
) {
  if (!assistantReply.trim()) return;

  await supabaseAdmin.from("messages").insert({
    chat_id: activeChatId,
    role: "assistant",
    content: assistantReply,
    metadata: metadata || {}
  });
}

function extractWebSourcesFromResponse(finalResponse: any) {
  const sources: Array<{ title: string; url: string }> = [];
  const outputItems = Array.isArray(finalResponse?.output) ? finalResponse.output : [];

  for (const item of outputItems) {
    if (item?.type !== "web_search_call") continue;
    const itemSources = item?.action?.sources;
    if (!Array.isArray(itemSources)) continue;

    for (const source of itemSources) {
      const url = typeof source?.url === "string" ? source.url : "";
      let hostname = "source";

      try {
        hostname = new URL(url).hostname.replace(/^www\./, "");
      } catch {}

      const rawTitle =
        typeof source?.title === "string" && source.title.trim().length > 0
          ? source.title.trim()
          : "";
      const normalizedTitle = rawTitle
        .replace(/\s*\|\s*[^|]+$/, "")
        .replace(/\s*[-:]\s*[^-:]+$/, "")
        .trim();
      const title =
        normalizedTitle &&
        !["source", "article", "link"].includes(normalizedTitle.toLowerCase())
          ? normalizedTitle
          : hostname;

      if (!url) continue;
      if (sources.some((existing) => existing.url === url)) continue;
      sources.push({ title, url });
    }
  }

  return sources.slice(0, 6);
}

function createSseEvent(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const trace = startRequestTrace("api/chat");
  let traceOwnerId: string | null = null;
  let traceChatId: string | null = null;

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

    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });
    traceOwnerId = ownerId;
    const normalizedMessages = normalizeMessages(messages) as ChatMessage[];
    const validatedMode = validateMode(mode);
    const validatedModel = validateModel(model);

    enforceMemoryRateLimit({
      key: `chat:${ownerId}`,
      limit: 10,
      windowMs: 60_000
    });
    await enforceDistributedRateLimit({
      ownerId,
      route: "chat",
      limit: 12,
      windowSeconds: 60
    });

    let activeChatId = chatId as string | null;
    traceChatId = activeChatId;

    if (activeChatId) {
      const ownership = await ensureChatOwnership(activeChatId, ownerId);
      if (!ownership.ok) {
        return NextResponse.json(
          { error: ownership.error },
          { status: ownership.status }
        );
      }
    }

    if (validatedModel === "claude" && !anthropicKey) {
      return NextResponse.json(
        { error: "Claude is not configured on the server." },
        { status: 500 }
      );
    }

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
    traceChatId = activeChatId;

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

      await saveAssistantMessage(activeChatId, assistantReply, {
        agentProfile,
        sources: []
      });
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

      const jsonResponse = NextResponse.json(
        {
          reply: assistantReply,
          chatId: activeChatId,
          rememberedMemory: effectiveMemory,
          agentProfile,
          sources: []
        },
        {
          headers: {
            "X-Chat-Id": String(activeChatId)
          }
        }
      );
      jsonResponse.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({
        trace,
        status: 200,
        ownerId: traceOwnerId,
        chatId: traceChatId,
        metadata: { model: validatedModel, stream: false }
      });
      return jsonResponse;
    }

    const useLiveWeb = effectiveWebSearch && shouldUseLiveWebSearch(latestUserMessage);
    const encoder = new TextEncoder();

    const responseStream = openai.responses.stream(
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
        include: useLiveWeb ? ["web_search_call.action.sources"] : [],
        tools: useLiveWeb ? [{ type: "web_search_preview" }] : [],
        stream: true
      },
      {
        signal: req.signal
      }
    );

    let assistantReply = "";
    let sources: Array<{ title: string; url: string }> = [];

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

          const finalResponse = await responseStream.finalResponse();
          sources = extractWebSourcesFromResponse(finalResponse);

          const finalReply = assistantReply.trim() || "No response.";
          await saveAssistantMessage(activeChatId, finalReply, {
            agentProfile,
            sources
          });
          await trackAnalyticsEvent({
            ownerId,
            eventName: "chat_success",
            chatId: activeChatId,
            metadata: {
              model: validatedModel,
              mode: validatedMode,
              liveDataUsed: useLiveWeb,
              sourcesCount: sources.length
            }
          });
          await finishRequestTrace({
            trace,
            status: 200,
            ownerId: traceOwnerId,
            chatId: traceChatId,
            metadata: {
              model: validatedModel,
              stream: true,
              liveDataUsed: useLiveWeb,
              sourcesCount: sources.length
            }
          });

          controller.enqueue(
            encoder.encode(
              createSseEvent("done", {
                reply: finalReply,
                chatId: activeChatId,
                liveDataUsed: useLiveWeb,
                rememberedMemory: effectiveMemory,
                agentProfile,
                sources
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
          await finishRequestTrace({
            trace,
            status: 500,
            ownerId: traceOwnerId,
            chatId: traceChatId,
            metadata: {
              model: validatedModel,
              stream: true,
              error:
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
        "X-Chat-Id": String(activeChatId),
        "X-Request-Id": trace.requestId
      }
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);

    const friendly = getFriendlyApiError(
      error,
      "We could not process that message right now. Please try again."
    );

    const response = NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId: traceOwnerId,
      chatId: traceChatId,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown chat error"
      }
    });
    return response;
  }
}
