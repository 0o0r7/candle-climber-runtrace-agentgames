import { RUNPROOF_MAX_BODY_BYTES } from "./http-guard";
import type { RunProofReport } from "./types";

export const RUNTRACE_REPORT_BUNDLE_FORMAT = "runtrace/report-bundle/v1" as const;

/** Parse one bounded JSON object for the same-origin RunTrace verifier. */
export function parseRunTraceJson(text: string): Record<string, unknown> {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > RUNPROOF_MAX_BODY_BYTES) {
    throw new RangeError(`Trace file exceeds the ${RUNPROOF_MAX_BODY_BYTES.toLocaleString("en-US")} byte limit.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new SyntaxError("Trace file is not valid JSON.");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Trace file must contain a JSON object.");
  }
  const document = value as Record<string, unknown>;
  if (document.format === RUNTRACE_REPORT_BUNDLE_FORMAT) {
    const trace = document.trace;
    if (typeof trace !== "object" || trace === null || Array.isArray(trace)) {
      throw new TypeError("Review bundle must contain a trace JSON object.");
    }
    return trace as Record<string, unknown>;
  }
  return document;
}

/** A portable local review bundle; it is not a signature, attestation, or proof. */
export function createRunTraceReportBundle(trace: unknown, report: RunProofReport) {
  return {
    format: RUNTRACE_REPORT_BUNDLE_FORMAT,
    trace,
    report,
  };
}
