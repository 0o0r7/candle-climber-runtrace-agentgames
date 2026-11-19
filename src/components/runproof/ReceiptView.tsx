"use client";

import { useEffect, useState } from "react";
import ProtocolShell from "@/components/protocol/ProtocolShell";
import type { RunProofReport, RunReceipt } from "@/game/runproof/types";

function CertRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="cert-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
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

  const issued = receipt
    ? `${new Date(receipt.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC`
    : null;

  return (
    <ProtocolShell active="receipt" width={860}>
      <article className="cert">
        <div className="cert-perf" aria-hidden="true" />

        <header className="cert-head">
          <div>
            <p className="cert-kicker">RUN RECEIPT</p>
            <h1 className="cert-title">
              {receipt ? `${receipt.seed.symbol} · ${receipt.seed.date}` : "RunTrace"}
            </h1>
            {receipt && (
              <p className="cert-sub">
                ISSUED {issued} · POLICY {receipt.report.policy}
              </p>
            )}
          </div>
          {receipt && (
            <div className={`cert-stamp${receipt.decision === "ACCEPT" ? "" : " is-flag"}`}>
              {receipt.decision}
              <span className="cert-stamp-sub">{receipt.report.task}</span>
            </div>
          )}
        </header>

        {loading && <p className="cert-note" style={{ marginTop: 18 }}>Loading the receipt…</p>}
        {error && <p role="alert" className="cert-alert" style={{ marginTop: 18 }}>{error}</p>}

        {receipt && (
          <>
            <p className="cert-reason">{receipt.report.reason}</p>

            <section className="cert-section">
              <h2 className="cert-section-title"><b>01</b> Verified outcome</h2>
              <dl style={{ margin: 0 }}>
                <CertRow label="Score" value={String(receipt.claims.score)} />
                <CertRow label="Candles passed" value={String(receipt.claims.candlesPassed)} />
                <CertRow label="Best streak" value={String(receipt.claims.bestStreak)} />
                <CertRow label="Death cause" value={receipt.claims.deathCause ?? "survived"} />
                <CertRow label="Fixed ticks" value={String(receipt.ticks)} />
                <CertRow label="Recorded inputs" value={String(receipt.inputCount)} />
              </dl>
            </section>

            <section className="cert-section">
              <h2 className="cert-section-title"><b>02</b> Terrain and identity</h2>
              <dl style={{ margin: 0 }}>
                <CertRow label="Terrain" value={`${receipt.terrainKind} · ${receipt.trace.terrain.candles.length} candles`} />
                <CertRow label="Provenance" value={receipt.terrainAttested ? "server-signed run token" : "unattested"} />
                <CertRow label="Trace hash" value={receipt.traceHash} />
                <CertRow label="Receipt id" value={receipt.id} />
              </dl>
            </section>

            <section className="cert-section">
              <h2 className="cert-section-title"><b>03</b> Evidence</h2>
              <ul className="cert-list">
                {receipt.report.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
              {receipt.report.issues.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", font: "11px/1.6 var(--rt-mono)", color: "#6B6459", letterSpacing: ".06em" }}>
                    VERIFIER FINDINGS ({receipt.report.issues.length})
                  </summary>
                  <ul className="cert-list" style={{ marginTop: 8, fontSize: 12 }}>
                    {receipt.report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}
                  </ul>
                </details>
              )}
            </section>

            <section className="cert-section">
              <h2 className="cert-section-title"><b>04</b> Re-check this receipt</h2>
              <p className="cert-note">
                Runs the stored trace through the verifier again, right now. A receipt you cannot reproduce is not a receipt.
              </p>
              <div className="cert-actions">
                <button type="button" className="cert-btn" onClick={() => void recheckNow()} disabled={rechecking}>
                  {rechecking ? "REPLAYING…" : "RE-VERIFY NOW"}
                </button>
                <button type="button" className="cert-btn cert-btn-ghost" onClick={downloadTrace}>
                  DOWNLOAD TRACE
                </button>
              </div>
              {recheckError && <p role="alert" className="cert-alert" style={{ marginTop: 12 }}>{recheckError}</p>}
              {recheck && (
                <div
                  aria-live="polite"
                  role="status"
                  className={`cert-recheck${recheck.decision === receipt.decision ? "" : " is-flag"}`}
                >
                  <p className="cert-recheck-verdict">
                    {recheck.decision} · {recheck.decision === receipt.decision ? "matches the stored verdict" : "DIFFERS from the stored verdict"}
                  </p>
                  <ul className="cert-list">
                    {recheck.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                  </ul>
                </div>
              )}
            </section>

            <p className="cert-links">
              <a href="/runproof">← RunTrace console</a> · <a href="/play">play the game</a>
            </p>
          </>
        )}

        <div className="cert-perf-bottom" aria-hidden="true" />
      </article>
    </ProtocolShell>
  );
}
