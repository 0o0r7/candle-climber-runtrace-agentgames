// Proof Gatekeeper task adapter — unit pins for the wire contract and the
// deterministic decision layer ported from agentgames-work/gatekeeper-agent
// (traps/decide.ts). Each documented trap class must name its reason code,
// malformed tasks must fail closed as signed HTTP 200 REJECTs, and the
// composite adapter must keep routing the Wildcard RunTrace contract.
import { describe, expect, test } from "bun:test";
import { createGatekeeperTaskAdapter, GATEKEEPER_TASK_TYPE } from "@/game/agentgames/gatekeeper";
import { createAgentGamesTaskAdapter, RUNPROOF_TASK_TYPE } from "@/game/agentgames/tasks";

const VK = "aa".repeat(32); // 32-byte hash field
const VK2 = "bb".repeat(32);
const ADDR = "cc".repeat(20); // 20-byte address
const ADDR2 = "dd".repeat(20);
const PROOF_TX = "ee".repeat(32);

function taskInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    registered_vk: VK,
    proof_vk: VK,
    minimum: "100",
    public_balance: "250",
    expiry_block: "1000",
    current_block: "900",
    recipient: ADDR,
    condition_recipient: ADDR,
    amount: "50",
    max_transfer: "100",
    ...overrides,
  };
}

function envelope(input: Record<string, unknown>, taskId = "task-ok"): Record<string, unknown> {
  return { type: GATEKEEPER_TASK_TYPE, task_id: taskId, input };
}

describe("Gatekeeper task adapter", () => {
  test("matches only the platform gatekeeper envelope type", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.matches({ type: GATEKEEPER_TASK_TYPE, task_id: "t1", input: {} })).toBe(true);
    expect(adapter.matches({ type: "agent-games.preflight.v1" })).toBe(false);
    expect(adapter.matches({ type: RUNPROOF_TASK_TYPE })).toBe(false);
    expect(adapter.matches(null)).toBe(false);
  });

  test("uses the snake_case task_id and falls back to a bounded deterministic id", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.getTaskId(envelope(taskInput(), "task-123"))).toBe("task-123");
    const missing = adapter.getTaskId({ type: GATEKEEPER_TASK_TYPE, input: {} });
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThanOrEqual(256);
    expect(adapter.getTaskId(envelope(taskInput(), "x".repeat(300)))).toMatch(/^unidentified-/);
  });

  test("VALID task approves", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope(taskInput()))).toEqual({ decision: "APPROVE", reason_code: "VALID" });
  });

  test("accepts the documented threshold alias and number/decimal-string coercions", () => {
    const adapter = createGatekeeperTaskAdapter();
    const aliased = envelope(taskInput({ minimum: undefined, threshold: 100 }));
    delete (aliased.input as Record<string, unknown>).minimum;
    expect(adapter.handle(aliased)).toEqual({ decision: "APPROVE", reason_code: "VALID" });
  });

  test("VK_SUBSTITUTION: proof key differs from the registered key", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope(taskInput({ proof_vk: VK2 })))).toEqual({
      decision: "REJECT",
      reason_code: "VK_SUBSTITUTION",
    });
  });

  test("THRESHOLD_MISMATCH: public balance below the required minimum", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope(taskInput({ public_balance: "99" })))).toEqual({
      decision: "REJECT",
      reason_code: "THRESHOLD_MISMATCH",
    });
  });

  test("RECIPIENT_MISMATCH: recipient differs from the condition recipient", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope(taskInput({ recipient: ADDR2 })))).toEqual({
      decision: "REJECT",
      reason_code: "RECIPIENT_MISMATCH",
    });
  });

  test("AMOUNT_OVERFLOW: amount above the condition maximum", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope(taskInput({ amount: "101" })))).toEqual({
      decision: "REJECT",
      reason_code: "AMOUNT_OVERFLOW",
    });
  });

  test("EXPIRED: current block at or past expiry; boundary counts as expired", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope(taskInput({ current_block: "1000" })))).toEqual({
      decision: "REJECT",
      reason_code: "EXPIRED",
    });
    expect(adapter.handle(envelope(taskInput({ current_block: "1001" })))).toEqual({
      decision: "REJECT",
      reason_code: "EXPIRED",
    });
  });

  test("PROOF_REUSED: an approved proof reference is rejected on a later task", () => {
    const adapter = createGatekeeperTaskAdapter();
    const first = envelope(taskInput({ proof_tx: PROOF_TX }), "task-a");
    expect(adapter.handle(first)).toEqual({ decision: "APPROVE", reason_code: "VALID" });
    const second = envelope(taskInput({ proof_tx: PROOF_TX }), "task-b");
    expect(adapter.handle(second)).toEqual({ decision: "REJECT", reason_code: "PROOF_REUSED" });
  });

  test("malformed tasks fail closed as signed HTTP-200 REJECTs, never errors", () => {
    const adapter = createGatekeeperTaskAdapter();
    expect(adapter.handle(envelope({}))).toEqual({ decision: "REJECT", reason_code: "MALFORMED_TASK" });
    expect(adapter.handle(envelope(taskInput({ recipient: "0xzz" })))).toEqual({
      decision: "REJECT",
      reason_code: "MALFORMED_TASK",
    });
    expect(adapter.handle(envelope(taskInput({ amount: "-5" })))).toEqual({
      decision: "REJECT",
      reason_code: "MALFORMED_TASK",
    });
  });
});

describe("Composite agent-games adapter", () => {
  test("routes by envelope type: gatekeeper snake_case id, runproof camelCase id", () => {
    const adapter = createAgentGamesTaskAdapter();
    expect(adapter.matches({ type: GATEKEEPER_TASK_TYPE, task_id: "t", input: {} })).toBe(true);
    expect(adapter.matches({ type: RUNPROOF_TASK_TYPE, taskId: "t", trace: {} })).toBe(true);
    expect(adapter.matches({ type: "agent-games.preflight.v1" })).toBe(false);
    expect(adapter.getTaskId(envelope(taskInput(), "gk-1"))).toBe("gk-1");
    expect(adapter.getTaskId({ type: RUNPROOF_TASK_TYPE, taskId: "rp-1" })).toBe("rp-1");
    expect(adapter.handle(envelope(taskInput(), "gk-2"))).toEqual({ decision: "APPROVE", reason_code: "VALID" });
  });
});
