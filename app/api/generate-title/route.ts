import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Generate a short chat title (max 5 words). No quotes. No punctuation."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 20
    });

    const title = completion.choices[0]?.message?.content?.trim() || "New Chat";

    return NextResponse.json({ title });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}