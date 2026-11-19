// Server-side terrain attestation for RunTrace.
//
// GET /api/candles signs the terrain it served (symbol + date + candle count +
// a short fingerprint of the exact candle JSON). A trace can carry that token;
// recomputing the fingerprint from the trace's own candles proves the run was
// played on the level the server actually served — not on hand-edited terrain.
//
// node:crypto lives here, never in verify.ts, so the replay core stays
// importable in the browser.
import { candleTerrainFingerprint, verifyRunToken } from "@/lib/run-token";
import { verifyTrace, type TerrainAttestation } from "./verify";
import type { RunProofReport, RunProofTrace } from "./types";

/** Check the attached token when there is one; `null` = no token to check. */
export function attestTerrainIfPresent(trace: RunProofTrace): TerrainAttestation | null {
  if (!trace.runToken) return null;
  return attestTerrain(trace);
}

/** Check the attached token and treat its absence as a failure. Receipts use
 *  this: a stored receipt must point at a level the server actually served. */
export function attestTerrain(trace: RunProofTrace): TerrainAttestation {
  if (!trace.runToken) {
    return { kind: "invalid", issue: { code: "missing_run_token", message: "A receipt requires a server-issued run token; none was attached." } };
  }
  const payload = verifyRunToken(trace.runToken);
  if (!payload) {
    return { kind: "invalid", issue: { code: "invalid_run_token", message: "The attached run token is not a valid server signature." } };
  }
  if (payload.symbol !== trace.seed.symbol || payload.date !== trace.seed.date) {
    return { kind: "invalid", issue: { code: "run_token_seed_mismatch", message: "The run token was issued for a different symbol or date." } };
  }
  if (payload.count !== trace.terrain.candles.length) {
    return { kind: "invalid", issue: { code: "run_token_terrain_mismatch", message: "The trace carries a different number of candles than the signed level." } };
  }
  if (payload.h !== candleTerrainFingerprint(JSON.stringify(trace.terrain.candles))) {
    return { kind: "invalid", issue: { code: "run_token_terrain_mismatch", message: "The trace candles do not match the signed terrain fingerprint." } };
  }
  return {
    kind: "verified",
    evidence: `Terrain matches the server-signed market level: ${payload.symbol} ${payload.date} · ${payload.count} closed ${payload.interval} candles.`,
  };
}

/** Verify a trace, checking the run token when one is attached. */
export function verifyTraceServer(raw: unknown): RunProofReport {
  return verifyTrace(raw, attestTerrainIfPresent);
}

/** Verify a trace for receipt issuance: attested terrain is required. */
export function verifyTraceForReceipt(raw: unknown): RunProofReport {
  return verifyTrace(raw, attestTerrain);
}
