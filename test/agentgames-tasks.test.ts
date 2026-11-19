// The RunTrace task envelope served by POST /api/agentgames.
//
// These are unit pins for the local contract documented in
// docs/runproof/agentgames-protocol.md: the envelope shape, the bounded task
// ID, and the fact that the adapter delegates to the same deterministic
// verifier as the public route.
import { describe, expect, test } from "bun:test";
import { dailyMutation } from "@/game/cc/mutations";
import { createRunProofTaskAdapter, RUNPROOF_TASK_TYPE } from "@/game/agentgames/tasks";
import { QA_SEED, QA_TERRAIN_KIND, makeQaCandles } from "@/game/runproof/qa-terrain";
import { deriveClaims } from "@/game/runproof/verify";
import type { RunProofReport, RunProofTrace } from "@/game/runproof/types";

function traceFixture(): RunProofTrace {
  const seed = { ...QA_SEED };
  const base = {
    format: "runproof/v1" as const,
    seed,
    terrain: { kind: QA_TERRAIN_KIND, candles: makeQaCandles() },
    mutationId: dailyMutation(seed.date + seed.symbol).id,
    ticks: 10,
    inputs: [],
  };
  return { ...base, claims: deriveClaims(base) };
}

describe("RunTrace task adapter", () => {
  const adapter = createRunProofTaskAdapter();

  test("matches only the documented task type", () => {
    expect(adapter.matches({ type: RUNPROOF_TASK_TYPE, taskId: "t1", trace: {} })).toBe(true);
    expect(adapter.matches({ type: "agent-games.preflight.v1" })).toBe(false);
    expect(adapter.matches({ type: "something.else" })).toBe(false);
    expect(adapter.matches(null)).toBe(false);
    expect(adapter.matches(["array"])).toBe(false);
  });

  test("accepts a bounded task ID and rejects anything else", () => {
    expect(adapter.getTaskId({ type: RUNPROOF_TASK_TYPE, taskId: "task-123" })).toBe("task-123");
    expect(adapter.getTaskId({ type: RUNPROOF_TASK_TYPE })).toBeNull();
    expect(adapter.getTaskId({ type: RUNPROOF_TASK_TYPE, taskId: "   " })).toBeNull();
    expect(adapter.getTaskId({ type: RUNPROOF_TASK_TYPE, taskId: "x".repeat(257) })).toBeNull();
    expect(adapter.getTaskId({ type: RUNPROOF_TASK_TYPE, taskId: 42 })).toBeNull();
  });

  test("delegates to the deterministic verifier", async () => {
    const trace = traceFixture();
    const accepted = (await adapter.handle({ type: RUNPROOF_TASK_TYPE, taskId: "ok", trace })) as RunProofReport;
    expect(accepted.task).toBe("verify-run-trace");
    expect(accepted.decision).toBe("ACCEPT");

    const tampered: RunProofTrace = { ...trace, claims: { ...trace.claims, score: trace.claims.score + 1 } };
    const flagged = (await adapter.handle({ type: RUNPROOF_TASK_TYPE, taskId: "bad", trace: tampered })) as RunProofReport;
    expect(flagged.decision).toBe("FLAG");
  });
});
