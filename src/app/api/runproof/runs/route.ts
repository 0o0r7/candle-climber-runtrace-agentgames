// RunTrace receipts — the stored, shareable result of a verified run.
//
// POST verifies a trace with its server-issued run token and stores the verdict
// plus the trace, so the receipt can be re-checked by anyone with the link.
// GET lists the newest receipts (summaries only).
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyTraceForReceipt } from "@/game/runproof/attest";
import {
  readCappedJsonBody,
  RunProofRequestGuard,
  RUNPROOF_MAX_BODY_BYTES,
} from "@/game/runproof/http-guard";
import type { RunProofTrace, RunReceipt } from "@/game/runproof/types";
import { clientIp } from "@/lib/http-limiter";
import { getRunproofStore, toReceiptSummary } from "@/lib/runproof-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Process-local, like the verifier route. A scaled deployment needs shared
// ingress limits and a shared rate-limit store.
const requestGuard = new RunProofRequestGuard();

const TERRAIN_ISSUES = new Set([
  "missing_run_token",
  "invalid_run_token",
  "run_token_seed_mismatch",
  "run_token_terrain_mismatch",
  "attestation_failed",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.floor(requested))) : 20;
  const store = getRunproofStore();
  const runs = await store.recent(limit);
  return NextResponse.json(
    { store: store.kind, runs },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const admission = requestGuard.acquire(clientIp(request));
  if (!admission.allowed) {
    if (admission.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Receipt requests are rate limited; retry later." },
        { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds), "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Receipt service is at its concurrency limit; retry shortly." },
      { status: 503, headers: { "Retry-After": "1", "Cache-Control": "no-store" } },
    );
  }

  try {
    const bodyResult = await readCappedJsonBody(request, RUNPROOF_MAX_BODY_BYTES);
    if (!bodyResult.ok) {
      const status = bodyResult.reason === "too_large" ? 413 : 400;
      return NextResponse.json(
        { error: bodyResult.reason === "too_large" ? "trace exceeds the 2 MB limit" : "request body must be valid UTF-8 JSON" },
        { status },
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(bodyResult.text);
    } catch {
      return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
    }

    // Receipts require attested terrain: the trace must carry the run token
    // GET /api/candles issued for the level it was played on.
    const report = verifyTraceForReceipt(raw);
    if (!report.replay) {
      return NextResponse.json({ error: "trace failed validation", report }, { status: 400 });
    }
    if (report.issues.some((issue) => TERRAIN_ISSUES.has(issue.code))) {
      return NextResponse.json({ error: "terrain is not attested by a server-issued run token", report }, { status: 422 });
    }

    const trace = raw as RunProofTrace;
    const receipt: RunReceipt = {
      id: randomUUID(),
      createdAt: Date.now(),
      decision: report.decision,
      seed: trace.seed,
      terrainKind: trace.terrain.kind,
      terrainAttested: true,
      ticks: trace.ticks,
      inputCount: trace.inputs.length,
      traceHash: createHash("sha256").update(JSON.stringify(trace)).digest("hex"),
      claims: {
        score: report.replay.score,
        candlesPassed: report.replay.candlesPassed,
        bestStreak: report.replay.bestStreak,
        deathCause: report.replay.deathCause,
      },
      report,
      trace,
    };

    const saved = await getRunproofStore().save(receipt);
    if (!saved) {
      return NextResponse.json({ error: "receipt storage is unavailable; retry shortly" }, { status: 503 });
    }
    return NextResponse.json(
      { id: receipt.id, receipt: toReceiptSummary(receipt) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "receipt issuance failed internally" }, { status: 500 });
  } finally {
    requestGuard.release();
  }
}
