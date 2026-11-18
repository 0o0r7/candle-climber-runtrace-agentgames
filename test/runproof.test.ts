import { describe, expect, test } from "bun:test";
import { dailyMutation } from "@/game/cc/mutations";
import { DEMO_SEED, DEMO_TERRAIN_KIND, makeDemoCandles } from "@/game/runproof/demo-data";
import { readCappedJsonBody, RunProofRequestGuard } from "@/game/runproof/http-guard";
import { FixedTickInputRecorder } from "@/game/runproof/recorder";
import { deriveClaims, verifyTrace } from "@/game/runproof/verify";
import { clientIp } from "@/lib/http-limiter";
import {
  RECORDER_FORMAT,
  RECORDER_ID,
  type InputEvent,
  type RunProofTrace,
} from "@/game/runproof/types";

function traceFor(inputs: InputEvent[] = [], ticks = 10): RunProofTrace {
  const seed = { ...DEMO_SEED };
  const traceBase = {
    format: "runproof/v1" as const,
    prototype: true as const,
    recorder: { format: RECORDER_FORMAT, id: RECORDER_ID, version: 1 as const, tickHz: 60 as const },
    seed,
    terrain: { kind: DEMO_TERRAIN_KIND, candles: makeDemoCandles() },
    mutationId: dailyMutation(seed.date + seed.symbol).id,
    ticks,
    inputs,
  };
  return { ...traceBase, claims: deriveClaims(traceBase) };
}

function streamedRequest(chunks: string[], headers: Record<string, string> = {}): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return { headers: new Headers(headers), body } as unknown as Request;
}

describe("fixed-tick input recorder", () => {
  test("stamps queued browser actions at the tick where the simulation consumes them", () => {
    const recorder = new FixedTickInputRecorder();
    recorder.queue("jump-down");
    recorder.queue("rush-down");
    expect(recorder.beginTick()).toEqual([
      { tick: 0, action: "jump-down" },
      { tick: 0, action: "rush-down" },
    ]);
    recorder.endTick();
    recorder.queue("jump-up");
    expect(recorder.beginTick()).toEqual([{ tick: 1, action: "jump-up" }]);
    recorder.endTick();
    expect(recorder.tick).toBe(2);
    expect(recorder.snapshot()).toEqual([
      { tick: 0, action: "jump-down" },
      { tick: 0, action: "rush-down" },
      { tick: 1, action: "jump-up" },
    ]);
  });
});

describe("RunProof replay verifier", () => {
  test("replays tick-stamped controls into engine-produced jump events", () => {
    const trace = traceFor([
      { tick: 19, action: "jump-down" },
      { tick: 27, action: "jump-up" },
      { tick: 67, action: "jump-down" },
      { tick: 75, action: "jump-up" },
    ], 120);
    const report = verifyTrace(trace);
    expect(report.decision).toBe("ACCEPT");
    expect(report.task).toBe("verify-run-trace");
    expect(report.policy).toBe("runproof/deterministic-replay/v1");
    expect(report.reason).toContain("deterministic replay");
    expect(report.evidence.length).toBeGreaterThan(0);
    expect(report.replay?.ticks).toBe(120);
    expect(report.replay?.jumpTicks).toEqual([19, 67]);
    expect(report.limits.some((limit) => limit.includes("terrain provenance is not authenticated"))).toBe(true);
  });

  test("rejects a fabricated impossible jump claim", () => {
    const trace = traceFor([], 10);
    trace.claims.jumpTicks = [0];
    const report = verifyTrace(trace);
    expect(report.decision).toBe("FLAG");
    expect(report.issues.some((issue) => issue.code === "impossible_jump")).toBe(true);
  });

  test("rejects a modified score claim", () => {
    const trace = traceFor([], 10);
    trace.claims.score += 1;
    const report = verifyTrace(trace);
    expect(report.decision).toBe("FLAG");
    expect(report.issues.some((issue) => issue.code === "score_mismatch")).toBe(true);
    expect(report.reason.length).toBeLessThan(240);
    expect(report.evidence.some((item) => item.includes("score_mismatch"))).toBe(true);
  });

  test("rejects out-of-order tick timing before replay", () => {
    const trace = traceFor([], 10);
    trace.inputs = [
      { tick: 4, action: "jump-down" },
      { tick: 2, action: "jump-up" },
    ];
    const report = verifyTrace(trace);
    expect(report.decision).toBe("FLAG");
    expect(report.issues.some((issue) => issue.code === "input_order")).toBe(true);
  });

  test("rejects unknown recorder metadata versions", () => {
    const trace = traceFor([], 10);
    trace.recorder = { format: RECORDER_FORMAT, id: RECORDER_ID, version: 1, tickHz: 30 } as never;
    const report = verifyTrace(trace);
    expect(report.decision).toBe("FLAG");
    expect(report.issues.some((issue) => issue.code === "invalid_recorder")).toBe(true);
  });

  test("rejects extra properties forbidden by the runproof/v1 JSON schema", () => {
    const trace = traceFor([], 10);
    const invalidTraces: Array<[unknown, string]> = [
      [{ ...structuredClone(trace), unexpected: true }, "invalid_shape"],
      [{ ...structuredClone(trace), seed: { ...trace.seed, unexpected: true } }, "invalid_seed"],
      [{ ...structuredClone(trace), terrain: { ...trace.terrain, unexpected: true } }, "invalid_terrain"],
      [{
        ...structuredClone(trace),
        terrain: { ...trace.terrain, candles: trace.terrain.candles.map((row, index) => index === 0 ? { ...row, unexpected: true } : row) },
      }, "invalid_terrain"],
      [{ ...structuredClone(trace), recorder: { ...trace.recorder, unexpected: true } }, "invalid_recorder"],
      [{ ...structuredClone(trace), inputs: [{ tick: 0, action: "jump-down", unexpected: true }] }, "invalid_input_event"],
      [{ ...structuredClone(trace), claims: { ...trace.claims, unexpected: true } }, "invalid_claims"],
      [{
        ...structuredClone(trace),
        claims: { ...trace.claims, scoreEvents: [{ tick: 0, score: 0, combo: 0, candlesPassed: 0, unexpected: true }] },
      }, "invalid_claims"],
    ];

    for (const [candidate, issueCode] of invalidTraces) {
      const report = verifyTrace(candidate);
      expect(report.decision).toBe("FLAG");
      expect(report.issues.some((issue) => issue.code === issueCode)).toBe(true);
    }
  });

  test("flags a pre-summit world transition as an impossible action", () => {
    const trace = traceFor([{ tick: 0, action: "enter-world2" }], 120);
    const report = verifyTrace(trace);
    expect(report.decision).toBe("FLAG");
    expect(report.issues.some((issue) => issue.code === "impossible_world2")).toBe(true);
  });
});

describe("RunProof HTTP guard", () => {
  test("uses the repository's x-real-ip-first client key convention", () => {
    const trusted = { headers: new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "spoofed, 203.0.113.9" }) } as Request;
    const fallback = { headers: new Headers({ "x-forwarded-for": "198.51.100.3, 203.0.113.10" }) } as Request;
    expect(clientIp(trusted)).toBe("203.0.113.7");
    expect(clientIp(fallback)).toBe("198.51.100.3");
  });

  test("enforces the byte cap while streaming even without Content-Length", async () => {
    const result = await readCappedJsonBody(streamedRequest(["1234", "56"]), 5);
    expect(result).toEqual({ ok: false, reason: "too_large" });

    const underreported = await readCappedJsonBody(streamedRequest(["1234", "56"], { "content-length": "1" }), 5);
    expect(underreported).toEqual({ ok: false, reason: "too_large" });
  });

  test("prechecks declared size and accepts a small streamed body", async () => {
    const tooLarge = await readCappedJsonBody(streamedRequest(["{}"], { "content-length": "6" }), 5);
    expect(tooLarge).toEqual({ ok: false, reason: "too_large" });

    const small = await readCappedJsonBody(streamedRequest(["{", "}"]), 5);
    expect(small).toEqual({ ok: true, bytes: new TextEncoder().encode("{}"), text: "{}" });
  });

  test("bounds in-flight work and applies a rolling per-client request limit", () => {
    const guard = new RunProofRequestGuard(1, 2, 60_000, 2);
    expect(guard.acquire("client-a", 1_000)).toEqual({ allowed: true });
    expect(guard.acquire("client-b", 1_001)).toEqual({ allowed: false, reason: "busy" });
    guard.release();
    expect(guard.acquire("client-a", 1_002)).toEqual({ allowed: true });
    expect(guard.acquire("client-a", 1_003)).toEqual({
      allowed: false,
      reason: "rate_limited",
      retryAfterSeconds: 60,
    });
    guard.release();
  });
});
