import type { Candle, DeathCause } from "../cc/types";

export const TRACE_FORMAT = "runproof/v1" as const;
export const RECORDER_FORMAT = "cc-fixed-tick-input/v1" as const;
export const RECORDER_ID = "candle-climber-runproof-demo" as const;
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

/** `runproof/v1` is a prototype trace contract, not an authenticated proof. */
export interface RunProofTrace {
  format: typeof TRACE_FORMAT;
  prototype: true;
  recorder?: RecorderMetadata;
  seed: { date: string; symbol: string };
  terrain: { kind: string; candles: Candle[] };
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
