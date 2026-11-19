import type { Candle, DeathCause } from "../cc/types";

export const TRACE_FORMAT = "runproof/v1" as const;
export const RECORDER_FORMAT = "cc-fixed-tick-input/v1" as const;
export const RECORDER_ID = "candle-climber-runtrace" as const;
export const RIVAL_QA_RECORDER_ID = "candle-climber-runtrace-rival-qa" as const;
export const FIXED_TICK_HZ = 60 as const;
export const FIXED_DT = 1 / FIXED_TICK_HZ;
export const MAX_TICKS = 7_200;
export const MAX_CANDLES = 1_000;
export const MAX_INPUTS = 50_000;

export type InputAction = "jump-down" | "jump-up" | "rush-down" | "rush-up" | "enter-world2";

export interface InputEvent {
  tick: number;
  action: InputAction;
}

export interface RecorderMetadata {
  format: typeof RECORDER_FORMAT;
  id: typeof RECORDER_ID | typeof RIVAL_QA_RECORDER_ID;
  version: 1;
  tickHz: typeof FIXED_TICK_HZ;
}

export interface ScoreEvent {
  tick: number;
  score: number;
  combo: number;
  candlesPassed: number;
}

export interface RunProofClaims {
  score: number;
  candlesPassed: number;
  bestStreak: number;
  deathCause: DeathCause | null;
  jumpTicks: number[];
  landTicks: number[];
  scoreEvents: ScoreEvent[];
}

/** A recorded run: fixed-tick inputs plus the terrain they were played on.
 *  Replaying it reproduces the run's own outputs — it is a replay-consistency
 *  record, not an identity claim about who played it. */
export interface RunProofTrace {
  format: typeof TRACE_FORMAT;
  recorder?: RecorderMetadata;
  seed: { date: string; symbol: string };
  terrain: { kind: string; candles: Candle[] };
  /** Server-issued HMAC from GET /api/candles binding symbol+date+terrain.
   *  When present the verifier checks it against `terrain.candles`; when absent
   *  (offline/synthetic fallback) the terrain provenance is unauthenticated. */
  runToken?: string;
  mutationId: string;
  ticks: number;
  inputs: InputEvent[];
  claims: RunProofClaims;
}

export interface RunProofIssue {
  code: string;
  message: string;
}

export type RunProofDecision = "ACCEPT" | "FLAG";

/** Run totals a receipt carries without the full trace. */
export interface RunReceiptClaims {
  score: number;
  candlesPassed: number;
  bestStreak: number;
  deathCause: DeathCause | null;
}

/** Stored, shareable receipt summary (list view). */
export interface RunReceiptSummary {
  id: string;
  createdAt: number;
  decision: RunProofDecision;
  seed: { date: string; symbol: string };
  terrainKind: string;
  /** True when the trace carried a server-issued run token that verified. */
  terrainAttested: boolean;
  ticks: number;
  inputCount: number;
  traceHash: string;
  claims: RunReceiptClaims;
}

/** A persisted receipt: the stored verdict plus the trace that produced it,
 *  so a third party can re-run the check. */
export interface RunReceipt extends RunReceiptSummary {
  report: RunProofReport;
  trace: RunProofTrace;
}

/** Output for the `verify-run-trace` task; policy evaluation is deterministic TypeScript, not an LLM. */
export interface RunProofReport {
  task: "verify-run-trace";
  policy: "runproof/deterministic-replay/v1";
  decision: RunProofDecision;
  reason: string;
  evidence: string[];
  ruleset: "this branch's Candle Climber deterministic core; fixed 60 Hz";
  replay: {
    ticks: number;
    score: number;
    candlesPassed: number;
    bestStreak: number;
    deathCause: DeathCause | null;
    jumpTicks: number[];
    landTicks: number[];
    scoreEvents: ScoreEvent[];
  } | null;
  issues: RunProofIssue[];
  limits: string[];
}
