"use client";

import type { ReactNode } from "react";
import type { ShowcaseProof, ShowcaseStage } from "./showcase-types";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type Tone = "ok" | "bad" | "pending" | "active";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--rt-pass)",
  bad: "var(--rt-flag)",
  pending: "var(--rt-muted)",
  active: "var(--rt-flag)",
};

const TONE_BORDER: Record<Tone, string> = {
  ok: "var(--rt-pass-line)",
  bad: "var(--rt-flag-line)",
  pending: "var(--rt-hairline)",
  active: "var(--rt-flag-line)",
};

function Row({ label, tag, tone, children }: { label: string; tag: string; tone: Tone; children: ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--rt-panel-2)", padding: "11px 0" }}>
      <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "var(--rt-ink-2)", font: `700 11px ${MONO}`, letterSpacing: ".1em" }}>{label}</span>
        <span
          style={{
            border: `1px solid ${TONE_BORDER[tone]}`,
            borderRadius: 999,
            color: TONE_COLOR[tone],
            font: `700 10px ${MONO}`,
            letterSpacing: ".08em",
            padding: "2px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {tag}
        </span>
      </div>
      <div style={{ color: "var(--rt-muted-2)", fontSize: 12.5, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export default function ShowcaseProofPanel({ stage, proof }: { stage: ShowcaseStage; proof: ShowcaseProof }) {
  const { terrain, trace, report, tamper, receipt, receiptError, receiptNote, recheck, recheckError } = proof;
  const signed = Boolean(terrain?.runToken);
  const tamperIssue = tamper?.issues[0];

  return (
    <section
      aria-label="Attestation states"
      style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, padding: "14px 16px" }}
    >
      <p style={{ color: "var(--rt-pass)", font: `700 11px ${MONO}`, letterSpacing: ".13em", margin: "0 0 4px" }}>
        WHAT THIS LOOP PROVES
      </p>
      <p style={{ color: "var(--rt-muted)", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 4px" }}>
        Every state below is produced by this page while it runs — nothing is pre-recorded.
      </p>

      <Row
        label="MARKET TERRAIN"
        tag={terrain ? (signed ? "SIGNED" : "UNATTESTED") : "WAIT"}
        tone={terrain ? (signed ? "ok" : "bad") : "pending"}
      >
        {terrain ? (
          <>
            {terrain.seed.symbol} · {terrain.seed.date} · {terrain.seed.interval} · {terrain.candles.length} closed candles ·{" "}
            {terrain.seed.source}
            <br />
            {signed ? (
              <span style={{ font: `11px ${MONO}`, color: "var(--rt-muted)" }}>run token {terrain.runToken?.slice(0, 18)}…</span>
            ) : (
              "The feed returned fallback candles without a server signature; a receipt cannot be issued."
            )}
          </>
        ) : (
          "Waiting for today's market level."
        )}
      </Row>

      <Row label="RECORDER" tag={trace ? "60 HZ" : stage === "recording" ? "LIVE" : "WAIT"} tone={trace ? "ok" : "pending"}>
        {trace
          ? `runproof/v1 · cc-fixed-tick-input/v1 · ${trace.ticks} fixed ticks · ${trace.inputs.length} input events`
          : "The agent's real presses are stamped at the fixed simulation boundary."}
      </Row>

      <Row
        label="SERVER REPLAY"
        tag={report ? report.decision : stage === "verifying" ? "REPLAYING" : "WAIT"}
        tone={report ? (report.decision === "ACCEPT" ? "ok" : "bad") : stage === "verifying" ? "active" : "pending"}
      >
        {report ? (
          <>
            {report.reason}
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {report.evidence.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
            <span style={{ color: "var(--rt-muted)", font: `11px ${MONO}` }}>policy {report.policy} · deterministic code, not an LLM</span>
          </>
        ) : (
          "The server re-simulates the recorded inputs and compares every claimed total."
        )}
      </Row>

      <Row
        label="TAMPER CHECK (+1 SCORE)"
        tag={tamper ? tamper.decision : "WAIT"}
        tone={tamper ? (tamper.decision === "FLAG" ? "ok" : "bad") : "pending"}
      >
        {tamper ? (
          <>
            A copy of the same run with one extra claimed point must be rejected.
            {tamperIssue ? (
              <>
                <br />
                <span style={{ font: `11px ${MONO}`, color: "var(--rt-flag)" }}>{tamperIssue.code}: {tamperIssue.message}</span>
              </>
            ) : null}
          </>
        ) : (
          "Runs after the replay check."
        )}
      </Row>

      <Row
        label="SHAREABLE RECEIPT"
        tag={receipt ? (receipt.reused ? "EXISTING" : "ISSUED") : receiptError ? "FAILED" : receiptNote ? "LIVE ONLY" : "WAIT"}
        tone={receipt ? "ok" : receiptError ? "bad" : receiptNote ? "ok" : "pending"}
      >
        {receipt ? (
          <a href={`/runproof/r/${receipt.id}`} style={{ color: "var(--rt-ink)" }}>
            /runproof/r/{receipt.id} ↗
          </a>
        ) : receiptError ? (
          receiptError
        ) : receiptNote ? (
          receiptNote
        ) : (
          "Stored with its trace, so anyone with the link can re-check it."
        )}
      </Row>

      <Row
        label="RE-VERIFY STORED TRACE"
        tag={recheck ? (recheck.match ? "MATCH" : "MISMATCH") : recheckError ? "FAILED" : "WAIT"}
        tone={recheck ? (recheck.match ? "ok" : "bad") : recheckError ? "bad" : "pending"}
      >
        {recheck
          ? `The receipt's stored trace replays to ${recheck.decision} with the same totals.`
          : recheckError ?? "Re-reads the receipt from the store and replays it again."}
      </Row>

      <div style={{ borderTop: "1px solid var(--rt-panel-2)", marginTop: 4, paddingTop: 10 }}>
        <p style={{ color: "var(--rt-muted)", font: `700 10px ${MONO}`, letterSpacing: ".1em", margin: "0 0 6px" }}>
          AGENT GAMES · WILDCARD CHECKLIST
        </p>
        <ul style={{ color: "var(--rt-muted-2)", fontSize: 11.5, lineHeight: 1.6, listStyle: "none", margin: 0, padding: 0 }}>
          <li><span style={{ color: "var(--rt-pass)" }}>✓</span> Public demo: this page, plus the console and receipt routes</li>
          <li><span style={{ color: "var(--rt-pass)" }}>✓</span> Public HTTPS endpoints: verify and receipt routes</li>
          <li><span style={{ color: "var(--rt-pass)" }}>✓</span> Build notes: docs/runproof and docs/competition</li>
          <li><span style={{ color: "var(--rt-muted)" }}>–</span> zkVerify proof: optional for this track, not included</li>
        </ul>
      </div>

      <div style={{ borderTop: "1px solid var(--rt-panel-2)", marginTop: 10, paddingTop: 10 }}>
        <p style={{ color: "var(--rt-muted)", font: `700 10px ${MONO}`, letterSpacing: ".1em", margin: "0 0 6px" }}>NOT CLAIMED</p>
        <ul style={{ color: "var(--rt-muted)", fontSize: 11.5, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
          <li>No zero-knowledge proof and no zkVerify submission. The bundled gatekeeper prover is an experimental module, local-only, never verified on zkVerify.</li>
          <li>Terrain is server-signed; player identity and input origin are not.</li>
          <li>Replay consistency only — a bounded sanity check, not an independent physics oracle.</li>
        </ul>
      </div>
    </section>
  );
}
