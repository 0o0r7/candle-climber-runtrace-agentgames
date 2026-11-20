/**
 * End-to-end proving tests for the Proof Gatekeeper response proof.
 *
 * These run the REAL official artifacts (fetched from the platform with pinned
 * sha256, cached in /tmp) and assert the full pipeline: witness calculation
 * agrees with our decision layer, the Groth16 proof generates, and it verifies
 * locally against the vk exported from the official zkey.
 *
 * Network-dependent: if the artifacts cannot be fetched, the suite skips (a
 * platform outage must not block CI — proving is fail-open at runtime).
 */
import { describe, expect, test } from "bun:test";
import { ensureCircuits } from "../src/game/agentgames/proving/artifacts";
import { proveGatekeeperDecision, proveBudgetMs } from "../src/game/agentgames/proving/prover";
import type { ProvingTaskInput } from "../src/game/agentgames/proving/mapping";

const VALID_TASK: ProvingTaskInput = {
  taskId: "gk_fixture_valid_0001",
  registeredVk: "6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0",
  proofVk: "6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0",
  minimum: 1000n,
  publicBalance: 1460n,
  expiryBlock: 8430000n,
  currentBlock: 8420000n,
  recipient: "de42ade42ade42ade42ade42ade42ade42ade42a",
  conditionRecipient: "de42ade42ade42ade42ade42ade42ade42ade42a",
  amount: 500n,
  maxTransfer: 1000n,
};

const VK_SUBSTITUTION_TASK: ProvingTaskInput = {
  ...VALID_TASK,
  taskId: "gk_fixture_vksub_0001",
  proofVk: "1345601345601345601345601345601345601345601345601345601345601345",
};

const artifactsReady = await ensureCircuits()
  .then(() => true)
  .catch(() => false);

// bun test has no describe.skipIf — pick the runner conditionally.
const provingSuite = artifactsReady ? describe : describe.skip;

provingSuite("gatekeeper proving (official artifacts)", () => {
  test(
    "VALID decision -> APPROVE proof with 13 public signals, locally verified",
    async () => {
      const result = await proveGatekeeperDecision(VALID_TASK, "APPROVE", 30_000);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.locallyVerified).toBe(true);
      expect(result.publicSignals.length).toBe(13);
      // decision is public signal index 11 per observedPublicSignalsOrder
      expect(result.publicSignals[11]).toBe("1");
      expect(result.proof.protocol).toBe("groth16");
      expect(result.proof.curve).toBe("bn128");
    },
    { timeout: 60_000 },
  );

  test(
    "VK_SUBSTITUTION decision -> REJECT proof whose decision bit is 0",
    async () => {
      const result = await proveGatekeeperDecision(VK_SUBSTITUTION_TASK, "REJECT", 30_000);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.locallyVerified).toBe(true);
      expect(result.publicSignals[11]).toBe("0");
    },
    { timeout: 60_000 },
  );

  test("proveBudgetMs clamps to a sane window", () => {
    const far = new Date(Date.now() + 120_000).toISOString();
    expect(proveBudgetMs(far)).toBe(9_000);
    expect(proveBudgetMs(null)).toBe(3_000);
    const near = new Date(Date.now() + 1_000).toISOString();
    expect(proveBudgetMs(near)).toBe(3_000);
  });
});
