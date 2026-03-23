import { NextResponse } from "next/server";
import { processQueuedExtractionJobs } from "@/lib/file-extraction-jobs";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

const WORKER_SECRET = process.env.INTERNAL_WORKER_SECRET || "";

function isWorkerAuthorized(req: Request) {
  if (!WORKER_SECRET) {
    return process.env.NODE_ENV !== "production";
  }
  const bearer = req.headers.get("authorization") || "";
  const token = bearer.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : req.headers.get("x-worker-secret") || "";
  return token === WORKER_SECRET;
}

export async function POST(req: Request) {
  const trace = startRequestTrace("api/file-extraction-worker");

  try {
    if (!isWorkerAuthorized(req)) {
      const response = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 401 });
      return response;
    }

    const processed = await processQueuedExtractionJobs({ limit: 3 });

    const response = NextResponse.json({ processed });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: 200,
      metadata: { processedCount: processed.length }
    });
    return response;
  } catch (error) {
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Worker failed." },
      { status: 500 }
    );
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: 500,
      metadata: {
        error: error instanceof Error ? error.message : "Worker failed."
      }
    });
    return response;
  }
}
