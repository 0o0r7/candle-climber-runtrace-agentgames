import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dailyMutation } from "@/game/cc/mutations";
import { attestTerrain, verifyTraceForReceipt, verifyTraceServer } from "@/game/runproof/attest";
import { QA_SEED, QA_TERRAIN_KIND, makeQaCandles } from "@/game/runproof/qa-terrain";
import { deriveClaims } from "@/game/runproof/verify";
import {
  RECORDER_FORMAT,
  RECORDER_ID,
  type InputEvent,
  type RunProofTrace,
  type RunReceipt,
} from "@/game/runproof/types";
import { MemoryRunproofStore } from "@/lib/runproof-store";
import { signRunToken } from "@/lib/run-token";

const ORIGINAL_SECRET = process.env.RUN_TOKEN_SECRET;

beforeAll(() => {
  // Tests must not depend on the deployment's production secret gate.
  process.env.RUN_TOKEN_SECRET = "runtrace-test-secret";
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.RUN_TOKEN_SECRET;
  else process.env.RUN_TOKEN_SECRET = ORIGINAL_SECRET;
});

function candlesToken(candles: ReturnType<typeof makeQaCandles>): string {
  return signRunToken(QA_SEED.symbol, QA_SEED.date, candles.length, JSON.stringify(candles), "1w");
}

function traceFor(options: { inputs?: InputEvent[]; ticks?: number; token?: string | null } = {}): RunProofTrace {
  const candles = makeQaCandles();
  const token = options.token === null ? undefined : options.token ?? candlesToken(candles);
  const traceBase = {
    format: "runproof/v1" as const,
    recorder: { format: RECORDER_FORMAT, id: RECORDER_ID, version: 1 as const, tickHz: 60 as const },
    seed: { ...QA_SEED },
    terrain: { kind: QA_TERRAIN_KIND, candles },
    ...(token ? { runToken: token } : {}),
    mutationId: dailyMutation(QA_SEED.date + QA_SEED.symbol).id,
    ticks: options.ticks ?? 10,
    inputs: options.inputs ?? [],
  };
  return { ...traceBase, claims: deriveClaims(traceBase) };
}

describe("terrain attestation", () => {
  test("accepts a run token signed for the trace's own candles", () => {
    const trace = traceFor();
    expect(attestTerrain(trace).kind).toBe("verified");
    const report = verifyTraceForReceipt(trace);
    expect(report.decision).toBe("ACCEPT");
    expect(report.evidence.some((line) => line.includes("server-signed market level"))).toBe(true);
  });

  test("flags a token whose candles were edited after signing", () => {
    const trace = traceFor();
    trace.terrain.candles = trace.terrain.candles.map((candle, index) =>
      index === 0 ? { ...candle, c: candle.c + 1, h: candle.h + 1 } : candle,
    );
    const attestation = attestTerrain(trace);
    expect(attestation.kind).toBe("invalid");
    expect(verifyTraceForReceipt(trace).decision).toBe("FLAG");
  });

  test("flags a forged token on the plain verifier route too", () => {
    const trace = traceFor({ token: "forged.token" });
    const report = verifyTraceServer(trace);
    expect(report.decision).toBe("FLAG");
    expect(report.issues.some((issue) => issue.code === "invalid_run_token")).toBe(true);
  });

  test("receipts require attestation; a plain replay check does not", () => {
    const trace = traceFor({ token: null });
    const receiptCheck = verifyTraceForReceipt(trace);
    expect(receiptCheck.decision).toBe("FLAG");
    expect(receiptCheck.issues.some((issue) => issue.code === "missing_run_token")).toBe(true);

    const plainCheck = verifyTraceServer(trace);
    expect(plainCheck.decision).toBe("ACCEPT");
    expect(plainCheck.evidence.some((line) => line.includes("unauthenticated"))).toBe(true);
  });
});

describe("receipt store", () => {
  function receiptFrom(trace: RunProofTrace): RunReceipt {
    const report = verifyTraceForReceipt(trace);
    if (!report.replay) throw new Error("fixture must validate");
    return {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: Date.now(),
      decision: report.decision,
      seed: trace.seed,
      terrainKind: trace.terrain.kind,
      terrainAttested: true,
      ticks: trace.ticks,
      inputCount: trace.inputs.length,
      traceHash: "0123456789abcdef",
      claims: {
        score: report.replay.score,
        candlesPassed: report.replay.candlesPassed,
        bestStreak: report.replay.bestStreak,
        deathCause: report.replay.deathCause,
      },
      report,
      trace,
    };
  }

  test("round-trips a receipt and lists summaries without the heavy fields", async () => {
    const store = new MemoryRunproofStore();
    const receipt = receiptFrom(traceFor());
    expect(await store.save(receipt)).toBe(true);

    const loaded = await store.get(receipt.id);
    expect(loaded?.id).toBe(receipt.id);
    expect(loaded?.trace.terrain.candles.length).toBe(receipt.trace.terrain.candles.length);

    const [summary] = await store.recent(5);
    expect(summary.id).toBe(receipt.id);
    expect(summary.decision).toBe("ACCEPT");
    expect("trace" in summary).toBe(false);
    expect("report" in summary).toBe(false);
  });

  test("returns null for an unknown id", async () => {
    const store = new MemoryRunproofStore();
    expect(await store.get("22222222-2222-4222-8222-222222222222")).toBeNull();
  });
});
