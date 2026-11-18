import { NextResponse } from "next/server";
import { verifyTrace } from "@/game/runproof/verify";
import { clientIp } from "@/lib/http-limiter";
import {
  readCappedJsonBody,
  RunProofRequestGuard,
  RUNPROOF_MAX_BODY_BYTES,
} from "@/game/runproof/http-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// These controls are process-local. A horizontally scaled deployment needs a
// trusted shared rate-limit store and ingress-level request/concurrency limits.
const requestGuard = new RunProofRequestGuard();

export async function POST(request: Request) {
  const admission = requestGuard.acquire(clientIp(request));
  if (!admission.allowed) {
    if (admission.reason === "rate_limited") {
      return NextResponse.json(
        { error: "RunTrace request rate limit exceeded; retry later." },
        { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds), "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "RunTrace replay checker is at its local concurrency limit; retry shortly." },
      { status: 503, headers: { "Retry-After": "1", "Cache-Control": "no-store" } },
    );
  }

  try {
    const bodyResult = await readCappedJsonBody(request, RUNPROOF_MAX_BODY_BYTES);
    if (!bodyResult.ok) {
      if (bodyResult.reason === "too_large") {
        return NextResponse.json({ error: "trace exceeds the 2 MB local demo limit" }, { status: 413 });
      }
      if (bodyResult.reason === "invalid_content_length") {
        return NextResponse.json({ error: "Content-Length must be a non-negative integer" }, { status: 400 });
      }
      if (bodyResult.reason === "invalid_utf8") {
        return NextResponse.json({ error: "request body must be valid UTF-8 JSON" }, { status: 400 });
      }
      return NextResponse.json({ error: "request body stream could not be read" }, { status: 400 });
    }

    let trace: unknown;
    try {
      trace = JSON.parse(bodyResult.text);
    } catch {
      return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
    }

    const report = verifyTrace(trace);
    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "RunTrace replay check failed internally" }, { status: 500 });
  } finally {
    requestGuard.release();
  }
}
