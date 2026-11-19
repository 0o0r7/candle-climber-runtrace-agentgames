import type { CandleData } from "@/game/cc/types";
import type { RunProofDecision, RunProofReport, RunProofTrace } from "@/game/runproof/types";

export type ShowcaseStage = "loading" | "recording" | "verifying" | "replaying" | "error";

export interface ShowcaseReceipt {
  id: string;
  /** True when an identical run's receipt already existed (no duplicate saved). */
  reused: boolean;
}

export interface ShowcaseRecheck {
  decision: RunProofDecision;
  /** Stored trace replays to the same verdict and totals as the fresh run. */
  match: boolean;
}

export interface ShowcaseProof {
  terrain: CandleData | null;
  trace: RunProofTrace | null;
  report: RunProofReport | null;
  tamper: RunProofReport | null;
  receipt: ShowcaseReceipt | null;
  receiptError: string | null;
  recheck: ShowcaseRecheck | null;
  recheckError: string | null;
}
