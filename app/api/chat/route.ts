import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { systemPromptForMode } from "@/lib/modes";

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

type ChatMessage = {
  role: "system" | "user" | "assistant";
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

function normalizeMessages(messages: unknown[]): ChatMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((m): m is { role: string; content: string } => {
      return (
        !!m &&
        typeof m === "object" &&
        "role" in m &&
        "content" in m &&
        typeof (m as { role: unknown }).role === "string" &&
        typeof (m as { content: unknown }).content === "string"
      );
    })
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant" || m.role === "system") &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content
    }));
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

    const ownerId = userId || guestId;

    if (!ownerId) {
      return NextResponse.json(
        { error: "Missing userId or guestId." },
        { status: 400 }
      );
    }

    const normalizedMessages = normalizeMessages(messages);

    if (normalizedMessages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    const usage = await incrementChatUsage(ownerId);
    const limit = userId ? USER_CHAT_LIMIT : GUEST_CHAT_LIMIT;

    if (usage.count > limit) {
      return NextResponse.json(
        { error: `Chat usage limit reached (${limit}).` },
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

    const latestUserMessage =
      [...normalizedMessages].reverse().find((m) => m.role === "user")?.content || "";

    const systemPrompt = systemPromptForMode(mode as any);

    const encoder = new TextEncoder();
    let assistantReply = "";
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (model === "claude") {
            if (!anthropicKey) {
              controller.enqueue(
                encoder.encode("Claude is not configured on the server.")
              );
              controller.close();
              streamClosed = true;
              return;
            }

            const anthropicMessages = normalizedMessages
              .filter(
                (
                  m
                ): m is {
                  role: "user" | "assistant";
                  content: string;
                } => m.role === "user" || m.role === "assistant"
              )
              .map((m) => ({
                role: m.role,
                content: m.content
              }));

            const anthropicStream = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 2000,
              temperature: 0.7,
              system: systemPrompt,
              messages: anthropicMessages as any,
              stream: true
            });

            for await (const event of anthropicStream) {
              if (event.type === "content_block_delta") {
                const token =
                  "text" in event.delta && typeof event.delta.text === "string"
                    ? event.delta.text
                    : "";

                if (token && !streamClosed) {
                  assistantReply += token;

                  try {
                    controller.enqueue(encoder.encode(token));
                  } catch {
                    streamClosed = true;
                    break;
                  }
                }
              }
            }
          } else {
            const openaiStream = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              temperature: 0.7,
              stream: true,
              messages: [
                { role: "system", content: systemPrompt },
                ...normalizedMessages
              ]
            });

            for await (const chunk of openaiStream) {
              const token = chunk.choices?.[0]?.delta?.content ?? "";

              if (token && !streamClosed) {
                assistantReply += token;

                try {
                  controller.enqueue(encoder.encode(token));
                } catch {
                  streamClosed = true;
                  break;
                }
              }
            }
          }

          if (latestUserMessage.trim() || assistantReply.trim()) {
            await supabaseAdmin.from("messages").insert([
              {
                chat_id: activeChatId,
                role: "user",
                content: latestUserMessage
              },
              {
                chat_id: activeChatId,
                role: "assistant",
                content: assistantReply
              }
            ]);
          }

          if (!streamClosed) {
            controller.close();
            streamClosed = true;
          }
        } catch (error) {
          console.error("Streaming error:", error);

          if (!streamClosed) {
            controller.error(error);
            streamClosed = true;
          }
        }
      },

      cancel() {
        streamClosed = true;
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Chat-Id": String(activeChatId),
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process chat request."
      },
      { status: 500 }
    );
  }
}