import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt =
      body.prompt ||
      body.messages?.[body.messages.length - 1]?.content;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
      console.log("IMAGE ERROR:", data);
      return NextResponse.json(
        { error: data?.error?.message || "Image generation failed" },
        { status: 500 }
      );
    }

    // ✅ HANDLE BOTH CASES
    let imageUrl = data?.data?.[0]?.url;

    if (!imageUrl && data?.data?.[0]?.b64_json) {
      imageUrl = `data:image/png;base64,${data.data[0].b64_json}`;
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No image returned from API" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: imageUrl });

  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
