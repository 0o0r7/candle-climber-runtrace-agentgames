import type { Candle } from "../cc/types";
import { hashString, mulberry32 } from "../cc/rng";

// Deterministic terrain for the autonomous QA suite and contract tests.
// It is NOT market data: the QA agent needs a stable, dependency-free level so
// a regression is attributable to the code under test. Real runs on the
// RunTrace console use market candles from GET /api/candles instead.

export const QA_SEED = { date: "2026-11-14", symbol: "RUNPROOF" } as const;
export const QA_TERRAIN_KIND = "qa-fixture-terrain";

/** Stable fictional OHLC fixture used only by the QA suite and tests. */
export function makeQaCandles(count = 72): Candle[] {
  const random = mulberry32(hashString("runproof-demo-terrain/v1"));
  const rows: Candle[] = [];
  let previous = 100;
  const start = Date.UTC(2025, 0, 1);

  for (let i = 0; i < count; i += 1) {
    const open = previous;
    const drift = (random() - 0.48) * 7;
    const close = Math.max(10, open + drift);
    const high = Math.max(open, close) + 0.5 + random() * 2.5;
    const low = Math.max(1, Math.min(open, close) - 0.5 - random() * 2.5);
    rows.push({
      t: start + i * 7 * 24 * 60 * 60 * 1000,
      o: Number(open.toFixed(4)),
      h: Number(high.toFixed(4)),
      l: Number(low.toFixed(4)),
      c: Number(close.toFixed(4)),
      v: 1_000 + i * 11,
    });
    previous = close;
  }

  return rows;
}
