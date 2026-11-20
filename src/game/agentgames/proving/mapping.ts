/**
 * proving/mapping.ts — config-driven circuit signal adapter for the official
 * Proof Gatekeeper circuit (signal-mapping.json next to this file).
 *
 * The signal names and witness layout were recovered from the official
 * gatekeeper.wasm and empirically validated against the official zkey (witness
 * calc succeeds/fails exactly along the documented trap rules; proofs verify
 * locally). The circuit DERIVES the decision from the inputs and asserts the
 * supplied decision, so a decision that disagrees with the circuit rules fails
 * the witness calculation — the caller must then omit the proof (fail-open).
 */
import { createHash, randomBytes } from "node:crypto";
import mappingJson from "./signal-mapping.json";

/** BN254 scalar field modulus. */
export const BN254_R = 21888746528947429908490886757795134457624969841098339174121695363588175819553n;

export type Encoding =
  | "hexHashTrunc31"
  | "uint"
  | "address"
  | "decisionEnum"
  | "sha256First31"
  | "randomSalt";

export interface InputMappingEntry {
  source: string;
  encoding: Encoding;
}

export interface SignalMapping {
  status: string;
  circuit: {
    wasmFile: string;
    zkeyFile: string;
    wasmSha256: string;
    zkeySha256: string;
    nPublic: number;
    observedPublicSignalsOrder: string[];
  };
  inputs: Record<string, InputMappingEntry>;
  decisionEncoding: { APPROVE: 1 | 0; REJECT: 1 | 0 };
  circuitChecksEmpiricallyAsserted?: string[];
}

/**
 * Structural subset of the gatekeeper task that proving needs. The production
 * NormalizedTask (../gatekeeper.ts) satisfies this shape: hash/address fields
 * are lowercase hex WITHOUT the 0x prefix, numeric fields are BigInt.
 */
export interface ProvingTaskInput {
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
}

let mappingCache: SignalMapping | null = null;

/**
 * Validated mapping object. The JSON is imported directly (bundled by
 * webpack/turbopack — no runtime fs dependency) and validated once per process.
 */
export function loadMapping(): SignalMapping {
  if (mappingCache === null) {
    const raw = mappingJson as unknown as SignalMapping;
    if (typeof raw.inputs !== "object" || raw.inputs === null) {
      throw new Error("signal mapping has no inputs table");
    }
    if (!raw.decisionEncoding || raw.decisionEncoding.APPROVE === undefined) {
      throw new Error("signal mapping has no decisionEncoding");
    }
    mappingCache = raw;
  }
  return mappingCache;
}

function hexToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

/** 31-byte truncation: the full 256-bit vk hash does NOT fit the 254-bit field. */
function hexHashTrunc31(hex: string): bigint {
  return hexToBigInt(hex.slice(0, 62));
}

/** Deterministic taskId encoding: first 31 bytes of sha256(utf8(taskId)). */
function sha256First31(taskId: string): bigint {
  const digest = createHash("sha256").update(taskId, "utf8").digest();
  return BigInt(`0x${digest.subarray(0, 31).toString("hex")}`);
}

/** Fresh blinding value < r (rejection sampling). */
export function randomSalt(): bigint {
  for (;;) {
    const candidate = BigInt(`0x${randomBytes(32).toString("hex")}`);
    if (candidate < BN254_R) return candidate;
  }
}

export interface MappingContext {
  task: ProvingTaskInput;
  decision: "APPROVE" | "REJECT";
  /** injected salt (tests) — random per call when omitted */
  salt?: bigint;
}

/**
 * Build the witness input object from the task using the mapping table.
 * Throws when a mapping entry references an unsupported encoding.
 */
export function buildWitnessInput(mapping: SignalMapping, ctx: MappingContext): Record<string, string> {
  const out: Record<string, string> = {};
  const sources: Record<string, unknown> = {
    registered_vk: ctx.task.registeredVk,
    proof_vk: ctx.task.proofVk,
    minimum: ctx.task.minimum,
    public_balance: ctx.task.publicBalance,
    expiry_block: ctx.task.expiryBlock,
    current_block: ctx.task.currentBlock,
    recipient: ctx.task.recipient,
    condition_recipient: ctx.task.conditionRecipient,
    amount: ctx.task.amount,
    max_transfer: ctx.task.maxTransfer,
    task_id: ctx.task.taskId,
    decision: ctx.decision,
    salt: null,
  };
  for (const [signalName, entry] of Object.entries(mapping.inputs)) {
    switch (entry.encoding) {
      case "hexHashTrunc31": {
        const v = sources[entry.source];
        if (typeof v !== "string") throw new Error(`mapping ${signalName}: source ${entry.source} missing`);
        out[signalName] = hexHashTrunc31(v).toString();
        break;
      }
      case "uint": {
        const v = sources[entry.source];
        if (typeof v !== "bigint") throw new Error(`mapping ${signalName}: source ${entry.source} missing`);
        out[signalName] = v.toString();
        break;
      }
      case "address": {
        const v = sources[entry.source];
        if (typeof v !== "string") throw new Error(`mapping ${signalName}: source ${entry.source} missing`);
        out[signalName] = hexToBigInt(v).toString();
        break;
      }
      case "decisionEnum": {
        const num = ctx.decision === "APPROVE" ? mapping.decisionEncoding.APPROVE : mapping.decisionEncoding.REJECT;
        out[signalName] = String(num);
        break;
      }
      case "sha256First31": {
        const v = sources[entry.source];
        if (typeof v !== "string") throw new Error(`mapping ${signalName}: source ${entry.source} missing`);
        out[signalName] = sha256First31(v).toString();
        break;
      }
      case "randomSalt": {
        const salt = ctx.salt ?? randomSalt();
        out[signalName] = salt.toString();
        break;
      }
      default:
        throw new Error(`mapping ${signalName}: unsupported encoding ${(entry as InputMappingEntry).encoding}`);
    }
  }
  return out;
}
