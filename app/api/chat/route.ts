import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { systemPromptForMode } from "@/lib/modes";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const GUEST_CHAT_LIMIT = 50;
const USER_CHAT_LIMIT = 500;

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

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
      return NextResponse.json(
        { error: "Missing environment variables." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      messages,
      mode = "general",
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

    if (!Array.isArray(messages) || messages.length === 0) {
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

    let activeChatId = chatId;

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
        messages.find((m: any) => m.role === "user")?.content || "New Chat";

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

    const latestUserMessage = messages[messages.length - 1]?.content || "";

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.7,
          stream: true,
          messages: [
            { role: "system", content: systemPromptForMode(mode as any) },
            ...messages
          ]
        })
      }
    );

    if (!openaiResponse.ok || !openaiResponse.body) {
      const errorText = await openaiResponse.text();
      return NextResponse.json(
        { error: errorText || "OpenAI streaming request failed." },
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let assistantReply = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = openaiResponse.body!.getReader();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;

              const data = trimmed.replace(/^data:\s*/, "");
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const token = parsed?.choices?.[0]?.delta?.content ?? "";

                if (token) {
                  assistantReply += token;
                  controller.enqueue(encoder.encode(token));
                }
              } catch {}
            }
          }

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

          controller.close();
        } catch (error) {
          controller.error(error);
        }
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