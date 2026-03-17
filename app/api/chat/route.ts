import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { systemPromptForMode } from "@/lib/modes";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

function getChatLimit(plan: string, isGuest: boolean) {
  if (isGuest) return 5;
  if (plan === "pro") return 300;
  return 30;
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
      guestId = null
    } = body;

    const isGuest = !userId;

    if (isGuest && !guestId) {
      return NextResponse.json(
        { error: "Missing guestId for guest usage tracking." },
        { status: 400 }
      );
    }

    let plan = "free";

    if (!isGuest) {
      const { data: planRow, error: planError } = await supabaseAdmin
        .from("user_plans")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle();

      if (planError) {
        return NextResponse.json(
          { error: `Failed to fetch user plan: ${planError.message}` },
          { status: 500 }
        );
      }

      plan = planRow?.plan || "free";
    }

    const today = new Date().toISOString().slice(0, 10);

    let usageQuery = supabaseAdmin
      .from("usage_logs")
      .select("count")
      .eq("feature", "chat")
      .eq("usage_date", today);

    usageQuery = isGuest
      ? usageQuery.eq("guest_id", guestId)
      : usageQuery.eq("user_id", userId);

    const { data: usageRows, error: usageError } = await usageQuery;

    if (usageError) {
      return NextResponse.json(
        { error: `Failed to read usage logs: ${usageError.message}` },
        { status: 500 }
      );
    }

    const usedToday = (usageRows || []).reduce(
      (sum, row) => sum + (row.count || 0),
      0
    );

    const limit = getChatLimit(plan, isGuest);

    if (usedToday >= limit) {
      return NextResponse.json(
        { error: `Daily chat limit reached for ${isGuest ? "guest" : plan} plan.` },
        { status: 403 }
      );
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPromptForMode(mode) },
          ...(Array.isArray(messages) ? messages : [])
        ]
      })
    });

    const openaiData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return NextResponse.json(
        { error: openaiData?.error?.message || "OpenAI request failed." },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabaseAdmin.from("usage_logs").insert({
      user_id: isGuest ? null : userId,
      guest_id: isGuest ? guestId : null,
      feature: "chat",
      count: 1
    });

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to store usage log: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reply: openaiData?.choices?.[0]?.message?.content || "No response received.",
      usage: {
        usedToday: usedToday + 1,
        limit
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
