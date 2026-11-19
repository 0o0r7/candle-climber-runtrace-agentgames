"use client";

import { useEffect, useState } from "react";
import type { RunProofReport, RunReceipt } from "@/game/runproof/types";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1c2328" }}>
      <span style={{ color: "#79838a", font: `12px ${MONO}` }}>{label}</span>
      <span style={{ color: "#f1f3f4", font: `12px ${MONO}`, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default function ReceiptView({ id }: { id: string }) {
  const [receipt, setReceipt] = useState<RunReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheck, setRecheck] = useState<RunProofReport | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/runproof/runs/${id}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null) as RunReceipt | { error?: string } | null;
        if (!response.ok || !payload || !("report" in payload)) {
          throw new Error(payload && "error" in payload && payload.error ? payload.error : `HTTP ${response.status}`);
        }
        if (!cancelled) setReceipt(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the receipt.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const recheckNow = async () => {
    if (!receipt || rechecking) return;
    setRechecking(true);
    setRecheckError(null);
    setRecheck(null);
    try {
      const response = await fetch("/api/runproof/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(receipt.trace),
      });
      const payload = await response.json() as RunProofReport | { error?: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error ?? `HTTP ${response.status}` : `HTTP ${response.status}`);
      setRecheck(payload as RunProofReport);
    } catch (err) {
      setRecheckError(err instanceof Error ? err.message : "Re-check failed.");
    } finally {
      setRechecking(false);
    }
  };

  const downloadTrace = () => {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt.trace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `runtrace-receipt-${receipt.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#090b0d", color: "#f1f3f4", fontFamily: "system-ui, sans-serif", padding: "24px 16px 48px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <p style={{ color: "#ccff00", font: `700 12px ${MONO}`, letterSpacing: ".13em", margin: "0 0 8px" }}>RUN RECEIPT</p>
        <h1 style={{ fontSize: "clamp(26px, 5vw, 40px)", letterSpacing: "-.03em", lineHeight: 1.1, margin: "0 0 12px" }}>
          {receipt ? `${receipt.seed.symbol} · ${receipt.seed.date}` : "RunTrace"}
        </h1>

        {loading && <p style={{ color: "#b5bbc1" }}>Loading the receipt…</p>}
        {error && <p role="alert" style={{ color: "#ff9a8b" }}>{error}</p>}

        {receipt && (
          <>
            <section style={{ background: "#111518", border: `1px solid ${receipt.decision === "ACCEPT" ? "#687c18" : "#75443e"}`, borderRadius: 10, padding: 16 }}>
              <p style={{ color: receipt.decision === "ACCEPT" ? "#ccff00" : "#ff9a8b", font: `800 22px ${MONO}`, margin: "0 0 6px" }}>
                {receipt.decision} · {receipt.report.task}
              </p>
              <p style={{ color: "#f1f3f4", lineHeight: 1.5, margin: "0 0 10px" }}>{receipt.report.reason}</p>
              <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                Issued {new Date(receipt.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC · Policy {receipt.report.policy}
              </p>
            </section>

            <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Verified outcome</h2>
              <Row label="Score" value={String(receipt.claims.score)} />
              <Row label="Candles passed" value={String(receipt.claims.candlesPassed)} />
              <Row label="Best streak" value={String(receipt.claims.bestStreak)} />
              <Row label="Death cause" value={receipt.claims.deathCause ?? "survived"} />
              <Row label="Fixed ticks" value={String(receipt.ticks)} />
              <Row label="Recorded inputs" value={String(receipt.inputCount)} />
            </section>

            <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Terrain and identity</h2>
              <Row label="Terrain" value={`${receipt.terrainKind} · ${receipt.trace.terrain.candles.length} candles`} />
              <Row label="Provenance" value={receipt.terrainAttested ? "server-signed run token" : "unattested"} />
              <Row label="Trace hash" value={receipt.traceHash} />
              <Row label="Receipt id" value={receipt.id} />
            </section>

            <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Evidence</h2>
              <ul style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
                {receipt.report.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
              {receipt.report.issues.length > 0 && (
                <details style={{ color: "#b5bbc1", fontSize: 12, marginTop: 10 }}>
                  <summary>Verifier findings ({receipt.report.issues.length})</summary>
                  <ul style={{ lineHeight: 1.5, paddingLeft: 20 }}>
                    {receipt.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}
                  </ul>
                </details>
              )}
            </section>

            <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Re-check this receipt</h2>
              <p style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
                Runs the stored trace through the verifier again, right now. A receipt you cannot reproduce is not a receipt.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  onClick={() => void recheckNow()}
                  disabled={rechecking}
                  style={{ background: rechecking ? "#626a70" : "#ccff00", border: 0, borderRadius: 6, color: "#10120b", cursor: "pointer", font: `700 14px ${MONO}`, padding: "11px 15px" }}
                >
                  {rechecking ? "REPLAYING…" : "RE-VERIFY NOW"}
                </button>
                <button
                  onClick={downloadTrace}
                  style={{ background: "#20272c", border: "1px solid #526068", borderRadius: 6, color: "#f1f3f4", cursor: "pointer", font: `700 14px ${MONO}`, padding: "11px 15px" }}
                >
                  DOWNLOAD TRACE
                </button>
              </div>
              {recheckError && <p role="alert" style={{ color: "#ff9a8b", marginBottom: 0 }}>{recheckError}</p>}
              {recheck && (
                <div aria-live="polite" role="status" style={{ background: "#090b0d", border: `1px solid ${recheck.decision === receipt.decision ? "#687c18" : "#75443e"}`, borderRadius: 8, marginTop: 12, padding: 14 }}>
                  <p style={{ color: recheck.decision === "ACCEPT" ? "#ccff00" : "#ff9a8b", font: `800 16px ${MONO}`, margin: "0 0 6px" }}>
                    {recheck.decision} · {recheck.decision === receipt.decision ? "matches the stored verdict" : "DIFFERS from the stored verdict"}
                  </p>
                  <ul style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
                    {recheck.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}

        <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>
          <a href="/runproof" style={{ color: "#b5bbc1" }}>← RunTrace console</a> ·{" "}
          <a href="/play" style={{ color: "#b5bbc1" }}>play the game</a>
        </p>
      </div>
    </main>
  );
}
