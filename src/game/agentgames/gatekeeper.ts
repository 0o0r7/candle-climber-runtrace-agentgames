// Proof Gatekeeper task adapter for the Agent Games endpoint.
//
// Ports the deterministic decision layer of the standalone gatekeeper agent
// (agentgames-work/gatekeeper-agent: protocol/envelope.ts + traps/decide.ts)
// into this deployment, so POST /api/agentgames can also answer the platform's
// Proof Gatekeeper tasks — the event this agent is registered and entered for.
//
// Wire contract (from the extracted build guide, unchanged):
//
//   request  { "type": "agent-games.proof-gatekeeper.v1", "task_id": "<id>",
//              "input": { registered_vk, proof_vk, minimum|threshold,
//                         public_balance, expiry_block, current_block,
//                         recipient, condition_recipient, amount,
//                         max_transfer, proof_tx? } }
//   response { "decision": "APPROVE" | "REJECT", "reason_code": "<code>" }
//
// Decision-only responses are valid (the Groth16 proof is optional and its
// absence is scored −2); this deployment does not run proving in the serverless
// route. Malformed tasks fail closed as a signed HTTP 200 REJECT with the
// extension reason code MALFORMED_TASK — never a non-2xx, which the platform
// would score as a forfeit.
//
// The proof-reuse ledger is per process (in-memory). Serverless instances
// recycle, so reuse detection across tasks is best-effort here — the same
// trade-off the standalone agent makes when JOURNAL_PATH is unset.
import { createHash } from "node:crypto";

export const GATEKEEPER_TASK_TYPE = "agent-games.proof-gatekeeper.v1" as const;

export type ReasonCode =
  | "VALID"
  | "VK_SUBSTITUTION"
  | "THRESHOLD_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "AMOUNT_OVERFLOW"
  | "PROOF_REUSED"
  | "EXPIRED"
  | "MALFORMED_TASK";

export interface GatekeeperDecision {
  decision: "APPROVE" | "REJECT";
  reason_code: ReasonCode;
}

interface NormalizedTask {
  taskId: string;
  registeredVk: string;
  proofVk: string;
  minimum: bigint;
  publicBalance: bigint;
  expiryBlock: bigint;
  currentBlock: bigint;
  recipient: string;
  conditionRecipient: string;
  amount: bigint;
  maxTransfer: bigint;
  proofTx: string | null;
}

export interface ReuseLedger {
  /** true iff this proof reference was already attached to an earlier APPROVED task */
  hasProofTx(proofTxHexLower: string): boolean;
}

class MalformedTaskError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asHex(v: unknown, field: string): string {
  if (typeof v !== "string") throw new MalformedTaskError(`${field} must be a hex string`);
  const s = v.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(s)) throw new MalformedTaskError(`${field} is not hex`);
  return s;
}

function asAddress(v: unknown, field: string): string {
  const s = asHex(v, field);
  if (s.length !== 40) throw new MalformedTaskError(`${field} must be a 20-byte address (40 hex chars)`);
  return s;
}

function asHashField(v: unknown, field: string): string {
  const s = asHex(v, field);
  if (s.length < 8) throw new MalformedTaskError(`${field} looks too short for a hash`);
  return s;
}

function asBigUint(v: unknown, field: string): bigint {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || v < 0) throw new MalformedTaskError(`${field} must be a non-negative integer`);
    return BigInt(v);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!/^[0-9]+$/.test(s)) throw new MalformedTaskError(`${field} must be a decimal string`);
    return BigInt(s);
  }
  throw new MalformedTaskError(`${field} must be a decimal string or integer number`);
}

/**
 * Coerce the documented envelope input into the normalized task. The guide's
 * sample uses "minimum"; the competition brief also names a "threshold" field —
 * both are accepted with minimum taking precedence when both are present.
 */
function normalizeTask(envelope: unknown): NormalizedTask {
  if (!isRecord(envelope)) throw new MalformedTaskError("body is not a JSON object");
  const taskId = envelope["task_id"];
  if (typeof taskId !== "string" || taskId.length === 0) throw new MalformedTaskError("task_id missing or not a string");
  if (!isRecord(envelope["input"])) throw new MalformedTaskError("input missing or not an object");
  const i = envelope["input"] as Record<string, unknown>;
  const thresholdRaw = i["minimum"] !== undefined ? i["minimum"] : i["threshold"];
  if (thresholdRaw === undefined) throw new MalformedTaskError("missing minimum/threshold");
  if (i["registered_vk"] === undefined) throw new MalformedTaskError("missing registered_vk");
  if (i["proof_vk"] === undefined) throw new MalformedTaskError("missing proof_vk");
  if (i["public_balance"] === undefined) throw new MalformedTaskError("missing public_balance");
  if (i["expiry_block"] === undefined) throw new MalformedTaskError("missing expiry_block");
  if (i["current_block"] === undefined) throw new MalformedTaskError("missing current_block");
  if (i["recipient"] === undefined) throw new MalformedTaskError("missing recipient");
  if (i["condition_recipient"] === undefined) throw new MalformedTaskError("missing condition_recipient");
  if (i["amount"] === undefined) throw new MalformedTaskError("missing amount");
  if (i["max_transfer"] === undefined) throw new MalformedTaskError("missing max_transfer");
  return {
    taskId,
    registeredVk: asHashField(i["registered_vk"], "registered_vk"),
    proofVk: asHashField(i["proof_vk"], "proof_vk"),
    minimum: asBigUint(thresholdRaw, "minimum"),
    publicBalance: asBigUint(i["public_balance"], "public_balance"),
    expiryBlock: asBigUint(i["expiry_block"], "expiry_block"),
    currentBlock: asBigUint(i["current_block"], "current_block"),
    recipient: asAddress(i["recipient"], "recipient"),
    conditionRecipient: asAddress(i["condition_recipient"], "condition_recipient"),
    amount: asBigUint(i["amount"], "amount"),
    maxTransfer: asBigUint(i["max_transfer"], "max_transfer"),
    proofTx: i["proof_tx"] === undefined ? null : asHex(i["proof_tx"], "proof_tx"),
  };
}

/**
 * The pure, deterministic decision function covering the 7 documented trap
 * classes. No I/O, no clocks, no randomness: the caller injects the reuse
 * ledger. Check order is fixed (first match names the reason_code):
 *   1. VK_SUBSTITUTION      2. THRESHOLD_MISMATCH   3. RECIPIENT_MISMATCH
 *   4. AMOUNT_OVERFLOW      5. PROOF_REUSED         6. EXPIRED
 * Otherwise VALID -> APPROVE. PROOF_REUSED semantics: a proof reference that
 * was already attached to a previously APPROVED task is treated as reused.
 */
export function decide(task: NormalizedTask, ledger?: ReuseLedger): GatekeeperDecision {
  // 1. The verification key matches the key registered for this condition.
  if (task.proofVk !== task.registeredVk) {
    return { decision: "REJECT", reason_code: "VK_SUBSTITUTION" };
  }
  // 2. Public inputs prove the required threshold.
  if (task.publicBalance < task.minimum) {
    return { decision: "REJECT", reason_code: "THRESHOLD_MISMATCH" };
  }
  // 3. Recipient commitment matches the payment condition.
  if (task.recipient !== task.conditionRecipient) {
    return { decision: "REJECT", reason_code: "RECIPIENT_MISMATCH" };
  }
  // 4. Amount does not overflow the condition limit.
  if (task.amount > task.maxTransfer) {
    return { decision: "REJECT", reason_code: "AMOUNT_OVERFLOW" };
  }
  // 5. The proof reference has not already been used for another task.
  if (task.proofTx !== null && ledger && ledger.hasProofTx(task.proofTx)) {
    return { decision: "REJECT", reason_code: "PROOF_REUSED" };
  }
  // 6. The condition is not expired at the current block height. A later
  //    on-chain confirmation does not revive an expired condition.
  if (task.currentBlock >= task.expiryBlock) {
    return { decision: "REJECT", reason_code: "EXPIRED" };
  }
  return { decision: "APPROVE", reason_code: "VALID" };
}

/** Deterministic bounded fallback ID for envelopes with no usable task_id. */
function fallbackTaskId(envelope: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(envelope ?? null)).digest("hex");
  return `unidentified-${digest.slice(0, 32)}`;
}

/**
 * Task adapter for the platform's Proof Gatekeeper envelopes. The reuse ledger
 * is owned by the adapter instance (built once per serverless process together
 * with the HTTP handler, so it spans requests on that instance).
 */
export function createGatekeeperTaskAdapter() {
  const approvedProofTx = new Map<string, string>();
  const ledger: ReuseLedger = { hasProofTx: (tx) => approvedProofTx.has(tx) };
  return {
    matches(envelope: unknown): boolean {
      return isRecord(envelope) && envelope["type"] === GATEKEEPER_TASK_TYPE;
    },
    getTaskId(envelope: unknown): string {
      if (isRecord(envelope)) {
        const id = envelope["task_id"];
        if (typeof id === "string" && id.trim().length > 0 && id.length <= 256) return id;
      }
      return fallbackTaskId(envelope);
    },
    handle(envelope: unknown): GatekeeperDecision {
      let decision: GatekeeperDecision;
      let task: NormalizedTask | null = null;
      try {
        task = normalizeTask(envelope);
        decision = decide(task, ledger);
      } catch (error) {
        if (error instanceof MalformedTaskError) {
          decision = { decision: "REJECT", reason_code: "MALFORMED_TASK" };
        } else {
          throw error;
        }
      }
      if (decision.decision === "APPROVE" && task?.proofTx) {
        approvedProofTx.set(task.proofTx, task.taskId);
      }
      return decision;
    },
  };
}
