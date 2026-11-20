import { createWildcardRunTraceAdapter } from "./adapter";
import { createGatekeeperTaskAdapter } from "./gatekeeper";

/**
 * This build's task envelope for the RunTrace verifier.
 *
 * Agent Games publishes no Wildcard-specific task envelope, so this is a
 * documented local contract rather than a platform-defined one:
 *
 *   { "type": "runproof.verify.v1", "taskId": "<idempotency key>", "trace": <runproof/v1> }
 *
 * The adapter is intentionally thin: it maps the envelope to the same
 * deterministic verifier the public HTTP route uses, so a signed task and a
 * public POST /api/runproof/verify answer with the same decision.
 */
export const RUNPROOF_TASK_TYPE = "runproof.verify.v1" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createRunProofTaskAdapter() {
  return createWildcardRunTraceAdapter({
    matchesEnvelope: (envelope) => isRecord(envelope) && envelope.type === RUNPROOF_TASK_TYPE,
    taskId: (envelope) => {
      if (!isRecord(envelope)) return null;
      const id = envelope.taskId;
      return typeof id === "string" && id.trim().length > 0 && id.length <= 256 ? id : null;
    },
    traceInput: (envelope) => (isRecord(envelope) ? envelope.trace : null),
  });
}

/**
 * Composite task adapter for the events this agent is registered for: the
 * Wildcard RunTrace verifier (local contract) plus the platform's Proof
 * Gatekeeper envelopes (agent-games.proof-gatekeeper.v1), answered with the
 * decision plus a locally-verified Groth16 proof when proving succeeds
 * (decision-only on any proving failure). Routing is by envelope type, so the
 * two contracts never collide.
 */
export function createAgentGamesTaskAdapter(opts?: { proving?: boolean }) {
  const runproof = createRunProofTaskAdapter();
  const gatekeeper = createGatekeeperTaskAdapter(opts);
  return {
    matches(envelope: unknown): boolean {
      return runproof.matches(envelope) || gatekeeper.matches(envelope);
    },
    getTaskId(envelope: unknown): string | null {
      if (gatekeeper.matches(envelope)) return gatekeeper.getTaskId(envelope);
      return runproof.getTaskId(envelope);
    },
    handle(envelope: unknown): unknown | Promise<unknown> {
      if (gatekeeper.matches(envelope)) return gatekeeper.handle(envelope);
      return runproof.handle(envelope);
    },
  };
}
