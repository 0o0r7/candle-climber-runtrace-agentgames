"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import ProtocolShell from "@/components/protocol/ProtocolShell";
import { Engine, VIEW_H, VIEW_W } from "@/game/cc/engine";
import { buildPlatforms } from "@/game/cc/level";
import { dailyMutation } from "@/game/cc/mutations";
import { render } from "@/game/cc/render";
import type { CandleData, RunResult } from "@/game/cc/types";
import { runRivalBotQaSuite, type RivalQaSuite } from "@/game/runproof/rival-qa";
import { FixedTickInputRecorder } from "@/game/runproof/recorder";
import {
  FIXED_DT,
  FIXED_TICK_HZ,
  RECORDER_FORMAT,
  RECORDER_ID,
  type InputAction,
  type RunProofClaims,
  type RunProofReport,
  type RunProofTrace,
  type RunReceiptSummary,
  type ScoreEvent,
} from "@/game/runproof/types";

const RECORDER_META = {
  format: RECORDER_FORMAT,
  id: RECORDER_ID,
  version: 1,
  tickHz: FIXED_TICK_HZ,
} as const;

type Phase = "idle" | "running" | "finished";
type ReportSource = "run" | "tamper";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function downloadJson(trace: RunProofTrace, suggestedName?: string): void {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName ?? `runtrace-${trace.seed.symbol.toLowerCase()}-${trace.ticks}ticks.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function RunTraceConsole() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const recorderRef = useRef<FixedTickInputRecorder | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const finishedRef = useRef(false);
  const resultRef = useRef<RunResult | null>(null);
  const jumpTicksRef = useRef<number[]>([]);
  const landTicksRef = useRef<number[]>([]);
  const scoreEventsRef = useRef<ScoreEvent[]>([]);
  const pressedRef = useRef(new Set<string>());
  const terrainRef = useRef<CandleData | null>(null);
  const seedStrRef = useRef("");
  const mutationRef = useRef<ReturnType<typeof dailyMutation> | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [hud, setHud] = useState({ score: 0, candlesPassed: 0, tick: 0 });
  const [terrain, setTerrain] = useState<CandleData | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(true);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const [trace, setTrace] = useState<RunProofTrace | null>(null);
  const [report, setReport] = useState<RunProofReport | null>(null);
  const [reportSource, setReportSource] = useState<ReportSource>("run");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RunReceiptSummary[]>([]);
  const [recentStore, setRecentStore] = useState<string | null>(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResult, setQaResult] = useState<RivalQaSuite | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);

  const setCurrentPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const loadTerrain = useCallback(async () => {
    setTerrainLoading(true);
    setTerrainError(null);
    try {
      const response = await fetch("/api/candles", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as CandleData | { error?: string } | null;
      if (!response.ok || !payload || !("candles" in payload) || !Array.isArray(payload.candles) || payload.candles.length < 10) {
        const message = payload && "error" in payload && payload.error ? payload.error : `HTTP ${response.status}`;
        throw new Error(message);
      }
      const seedStr = payload.seed.date + payload.seed.symbol;
      terrainRef.current = payload;
      seedStrRef.current = seedStr;
      mutationRef.current = dailyMutation(seedStr);
      setTerrain(payload);
      setTrace(null);
      setReport(null);
      setSavedId(null);
      setCurrentPhase("idle");
    } catch (error) {
      setTerrainError(error instanceof Error ? error.message : "Could not load market data.");
    } finally {
      setTerrainLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetch("/api/runproof/runs?limit=8", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { store: string; runs: RunReceiptSummary[] };
      setRecent(Array.isArray(payload.runs) ? payload.runs : []);
      setRecentStore(payload.store ?? null);
    } catch {
      // The list is informational; a failed read never blocks the console.
    }
  }, []);

  useEffect(() => {
    void loadTerrain();
    void loadRecent();
  }, [loadTerrain, loadRecent]);

  const startRun = () => {
    const data = terrainRef.current;
    const mutation = mutationRef.current;
    if (!data || !mutation) return;

    const recorder = new FixedTickInputRecorder();
    const jumpTicks: number[] = [];
    const landTicks: number[] = [];
    const scoreEvents: ScoreEvent[] = [];
    recorderRef.current = recorder;
    resultRef.current = null;
    jumpTicksRef.current = jumpTicks;
    landTicksRef.current = landTicks;
    scoreEventsRef.current = scoreEvents;
    pressedRef.current.clear();
    finishedRef.current = false;
    setTrace(null);
    setReport(null);
    setSavedId(null);
    setSaveError(null);
    setVerifyError(null);
    setHud({ score: 0, candlesPassed: 0, tick: 0 });

    engineRef.current = new Engine(buildPlatforms(data.candles, seedStrRef.current), {
      onDeath: (result) => { resultRef.current = result; },
      onScore: (score, combo) => {
        const engine = engineRef.current;
        const currentTick = recorder.tick;
        scoreEvents.push({ tick: currentTick, score, combo, candlesPassed: engine?.candlesPassed ?? 0 });
        setHud({ score, candlesPassed: engine?.candlesPassed ?? 0, tick: recorder.tick });
      },
      onSfx: (name) => {
        if (name === "jump") jumpTicks.push(recorder.tick);
        if (name === "land") landTicks.push(recorder.tick);
      },
    }, mutation.mods, seedStrRef.current);
    setCurrentPhase("running");
  };

  const applyAction = (engine: Engine, action: InputAction) => {
    if (action === "jump-down") engine.press();
    else if (action === "jump-up") engine.release();
    else if (action === "rush-down") engine.pressRush();
    else if (action === "rush-up") engine.releaseRush();
    else if (action === "enter-world2" && engine.graduated) engine.enterWorld2();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let animation = 0;
    let lastTime = 0;
    let accumulator = 0;
    let dpr = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
      offsetX = (rect.width - VIEW_W * scale) / 2;
      offsetY = (rect.height - VIEW_H * scale) / 2;
    };
    resize();
    window.addEventListener("resize", resize);

    const finishRun = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const result = resultRef.current;
      const recorder = recorderRef.current;
      const data = terrainRef.current;
      const mutation = mutationRef.current;
      if (!result || !recorder || !data || !mutation) return;
      const claims: RunProofClaims = {
        score: result.score,
        candlesPassed: result.candlesPassed,
        bestStreak: result.bestStreak,
        deathCause: result.cause ?? null,
        jumpTicks: [...jumpTicksRef.current],
        landTicks: [...landTicksRef.current],
        scoreEvents: [...scoreEventsRef.current],
      };
      const finishedTrace: RunProofTrace = {
        format: "runproof/v1",
        recorder: RECORDER_META,
        seed: { date: data.seed.date, symbol: data.seed.symbol },
        terrain: { kind: `market-${data.seed.source}`, candles: data.candles },
        ...(data.runToken ? { runToken: data.runToken } : {}),
        mutationId: mutation.id,
        ticks: recorder.tick,
        inputs: recorder.snapshot(),
        claims,
      };
      setTrace(finishedTrace);
      setHud({ score: result.score, candlesPassed: result.candlesPassed, tick: recorder.tick });
      setCurrentPhase("finished");
    };

    const frame = (now: number) => {
      const engine = engineRef.current;
      if (lastTime === 0) lastTime = now;
      const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (phaseRef.current === "running" && !finishedRef.current) {
        accumulator += elapsed;
        while (accumulator >= FIXED_DT && !finishedRef.current) {
          const currentEngine = engineRef.current;
          const recorder = recorderRef.current;
          if (!currentEngine || !recorder) break;
          const stamped = recorder.beginTick();
          for (const event of stamped) applyAction(currentEngine, event.action);
          currentEngine.step(FIXED_DT);
          recorder.endTick();
          accumulator -= FIXED_DT;
          setHud({ score: Math.floor(currentEngine.score), candlesPassed: currentEngine.candlesPassed, tick: recorder.tick });
          if (currentEngine.dead) finishRun();
        }
      } else {
        accumulator = 0;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rect = canvas.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);
      context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
      if (engine) {
        render(context, engine, seedStrRef.current, mutationRef.current?.id ?? "");
      } else {
        context.fillStyle = "#08090C";
        context.fillRect(0, 0, VIEW_W, VIEW_H);
        context.fillStyle = "#7CFFB2";
        context.font = `700 26px ${MONO}`;
        context.fillText("RUNTRACE", 36, 66);
        context.fillStyle = "#B3BDC4";
        context.font = `16px ${MONO}`;
        context.fillText(
          terrainRef.current
            ? `${terrainRef.current.seed.symbol} · start a run to record real input at 60 Hz`
            : "loading today's market chart…",
          36,
          98,
        );
      }
      animation = requestAnimationFrame(frame);
    };

    animation = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const actionForCode = (code: string): InputAction | null => {
      if (code === "Space" || code === "ArrowUp" || code === "KeyW") return "jump-down";
      if (code === "ShiftLeft" || code === "ShiftRight") return "rush-down";
      return null;
    };
    const releaseForCode = (code: string): InputAction | null => {
      if (code === "Space" || code === "ArrowUp" || code === "KeyW") return "jump-up";
      if (code === "ShiftLeft" || code === "ShiftRight") return "rush-up";
      return null;
    };
    const editableTarget = (target: EventTarget | null) => {
      const tag = (target as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || editableTarget(event.target)) return;
      const action = actionForCode(event.code);
      if (!action || phaseRef.current !== "running" || finishedRef.current) return;
      event.preventDefault();
      if (pressedRef.current.has(event.code)) return;
      pressedRef.current.add(event.code);
      recorderRef.current?.queue(action);
    };
    const keyUp = (event: KeyboardEvent) => {
      const action = releaseForCode(event.code);
      if (!action || !pressedRef.current.has(event.code)) return;
      pressedRef.current.delete(event.code);
      if (phaseRef.current === "running" && !finishedRef.current) recorderRef.current?.queue(action);
    };
    const pointerUp = () => {
      if (!pressedRef.current.has("pointer")) return;
      pressedRef.current.delete("pointer");
      if (phaseRef.current === "running" && !finishedRef.current) recorderRef.current?.queue("jump-up");
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("blur", pointerUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("blur", pointerUp);
    };
  }, []);

  const onCanvasPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "running" || finishedRef.current || pressedRef.current.has("pointer")) return;
    event.preventDefault();
    pressedRef.current.add("pointer");
    recorderRef.current?.queue("jump-down");
  };

  const verifyTraceLocally = async (candidate: RunProofTrace, source: ReportSource) => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    setReport(null);
    setReportSource(source);
    try {
      const response = await fetch("/api/runproof/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(candidate),
      });
      const payload = await response.json() as RunProofReport | { error?: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error ?? `HTTP ${response.status}` : `HTTP ${response.status}`);
      setReport(payload as RunProofReport);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "Replay check failed.");
    } finally {
      setVerifying(false);
    }
  };

  const verifyRun = () => {
    if (trace) void verifyTraceLocally(trace, "run");
  };

  const runTamperTest = () => {
    if (!trace) return;
    const tampered: RunProofTrace = { ...trace, claims: { ...trace.claims, score: trace.claims.score + 1 } };
    void verifyTraceLocally(tampered, "tamper");
  };

  const saveReceipt = async () => {
    if (!trace || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/runproof/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trace),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setSavedId(payload.id);
      void loadRecent();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the receipt.");
    } finally {
      setSaving(false);
    }
  };

  const runRivalQa = () => {
    if (qaRunning || verifying || phase === "running") return;
    setQaRunning(true);
    setQaError(null);
    setQaResult(null);
    window.setTimeout(() => {
      try {
        setQaResult(runRivalBotQaSuite());
      } catch (error) {
        setQaError(error instanceof Error ? error.message : "The RivalBot QA suite failed.");
      } finally {
        setQaRunning(false);
      }
    }, 0);
  };

  const buttonStyle: CSSProperties = {
    background: "var(--rt-pass)",
    border: 0,
    borderRadius: 6,
    color: "var(--rt-pass-ink)",
    cursor: "pointer",
    font: `700 14px ${MONO}`,
    padding: "11px 15px",
  };
  const secondaryButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: "var(--rt-panel-2)",
    border: "1px solid var(--rt-hairline-strong)",
    color: "var(--rt-ink)",
  };

  const attested = Boolean(terrain?.runToken);
  const sourceLabel = terrain ? `${terrain.seed.symbol} · ${terrain.seed.date} · ${terrain.seed.interval}` : "no terrain";
  const canPlay = Boolean(terrain) && phase !== "running";

  return (
    <ProtocolShell active="console" width={1000}>
        <p style={{ color: "var(--rt-pass)", font: `700 12px ${MONO}`, letterSpacing: ".13em", margin: "0 0 8px" }}>VERIFIED RUN RECEIPTS</p>
        <h1 style={{ fontSize: "clamp(30px, 6vw, 52px)", letterSpacing: "-.04em", lineHeight: 1, margin: "0 0 12px" }}>RunTrace</h1>
        <p style={{ color: "var(--rt-muted-2)", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 780 }}>
          Play today&apos;s market chart, then have the server replay your run. A run whose inputs reproduce its own score becomes a
          shareable receipt that anyone can re-check — the terrain is pinned to the market level the server signed, so a receipt
          cannot be moved to a different chart.
        </p>
        <p style={{ font: `12px ${MONO}`, margin: "0 0 20px" }}>
          <a href="/runproof/showcase" style={{ color: "var(--rt-pass)" }}>WATCH THE SHOWCASE LOOP ↗</a>
          <span style={{ color: "var(--rt-muted)" }}> — an agent plays today&apos;s signed level on a verified replay loop.</span>
        </p>

        <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: "12px 16px" }}>
            <div style={{ color: "var(--rt-ink-2)", font: `12px ${MONO}` }}>
              {terrainLoading
                ? "LOADING MARKET TERRAIN…"
                : terrainError
                  ? "MARKET TERRAIN UNAVAILABLE"
                  : phase === "running"
                    ? "RUNNING · INPUTS CAPTURED AT 60 HZ"
                    : phase === "finished"
                      ? "RUN ENDED · TRACE READY"
                      : "READY · REAL MARKET TERRAIN"}
            </div>
            <div style={{ color: "var(--rt-ink)", font: `12px ${MONO}` }}>
              SCORE {hud.score} · CANDLES {hud.candlesPassed} · TICK {hud.tick}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "0 16px 12px", font: `12px ${MONO}` }}>
            <span style={{ color: "var(--rt-muted)" }}>{sourceLabel}</span>
            {terrain && <span style={{ color: "var(--rt-muted)" }}>· {terrain.candles.length} closed candles · {terrain.seed.source}</span>}
            <span
              style={{
                border: `1px solid ${attested ? "var(--rt-pass-line)" : "var(--rt-flag-line)"}`,
                borderRadius: 999,
                color: attested ? "var(--rt-pass)" : "var(--rt-flag)",
                padding: "2px 8px",
              }}
            >
              {attested ? "SERVER-SIGNED TERRAIN" : "UNATTESTED TERRAIN"}
            </span>
            <button onClick={() => void loadTerrain()} disabled={terrainLoading || phase === "running"} style={{ ...secondaryButtonStyle, fontSize: 11, padding: "6px 9px" }}>
              REFRESH LEVEL
            </button>
          </div>
          <canvas
            ref={canvasRef}
            aria-label="RunTrace run canvas"
            onPointerDown={onCanvasPointerDown}
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, background: "var(--rt-bg)", display: "block", touchAction: "none", width: "100%" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 16 }}>
            {phase !== "running" && (
              <button onClick={startRun} disabled={!canPlay} style={{ ...buttonStyle, background: canPlay ? "var(--rt-pass)" : "var(--rt-disabled)" }}>
                {phase === "finished" ? "PLAY ANOTHER RUN" : "START RUN"}
              </button>
            )}
            {trace && <button onClick={verifyRun} disabled={verifying} style={{ ...secondaryButtonStyle, background: verifying ? "var(--rt-disabled)" : "var(--rt-panel-2)" }}>{verifying ? "REPLAYING…" : "REPLAY-CHECK"}</button>}
            {trace && (
              <button onClick={() => void saveReceipt()} disabled={saving || !trace.runToken} style={{ ...secondaryButtonStyle, opacity: trace.runToken ? 1 : 0.55 }}>
                {saving ? "SAVING…" : "SAVE RECEIPT"}
              </button>
            )}
            {trace && <button onClick={() => downloadJson(trace)} style={secondaryButtonStyle}>DOWNLOAD JSON</button>}
          </div>
          {terrainError && (
            <p role="alert" style={{ color: "var(--rt-flag)", margin: "0 16px 16px" }}>
              Could not load market data ({terrainError}). The console needs a signed level to record a receipt.
            </p>
          )}
          {!attested && terrain && !terrainLoading && (
            <p style={{ color: "var(--rt-flag)", margin: "0 16px 16px", fontSize: 13, lineHeight: 1.6 }}>
              The feed returned fallback terrain without a server signature, so runs here can be replayed but cannot become receipts.
              Refresh the level to try the market feed again.
            </p>
          )}
          {saveError && <p role="alert" style={{ color: "var(--rt-flag)", margin: "0 16px 16px" }}>{saveError}</p>}
          {savedId && (
            <p style={{ margin: "0 16px 16px", font: `13px ${MONO}` }}>
              <span style={{ color: "var(--rt-pass)" }}>RECEIPT SAVED</span>{" "}
              <a href={`/runproof/r/${savedId}`} style={{ color: "var(--rt-ink)" }}>OPEN RECEIPT ↗</a>{" "}
              <span style={{ color: "var(--rt-muted)" }}>({savedId})</span>
            </p>
          )}
        </section>

        {trace && (
          <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, marginTop: 16, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Run trace</h2>
            <p style={{ color: "var(--rt-muted-2)", fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" }}>
              {trace.format} · {trace.recorder?.format} · {trace.ticks} fixed ticks · {trace.inputs.length} recorded input events ·{" "}
              {trace.terrain.candles.length} market candles · {trace.runToken ? "server-signed terrain" : "unattested terrain"}
            </p>
            {verifying && <p role="status" style={{ color: "var(--rt-muted-2)", marginBottom: 0 }}>Replaying the run…</p>}
            {report && (
              <div aria-live="polite" role="status" style={{ background: "var(--rt-bg)", border: `1px solid ${report.decision === "ACCEPT" ? "var(--rt-pass-line)" : "var(--rt-flag-line)"}`, borderRadius: 8, marginTop: 12, padding: 14 }}>
                <p style={{ color: report.decision === "ACCEPT" ? "var(--rt-pass)" : "var(--rt-flag)", font: `800 18px ${MONO}`, margin: "0 0 4px" }}>
                  {report.decision} · {report.task}
                </p>
                <p style={{ color: "var(--rt-muted)", font: `12px ${MONO}`, margin: "0 0 8px" }}>
                  {reportSource === "tamper" ? "SOURCE: YOUR RUN WITH SCORE +1 (SELF-TEST)" : "SOURCE: YOUR RUN"}
                </p>
                <p style={{ color: "var(--rt-ink)", lineHeight: 1.5, margin: "0 0 10px" }}>{report.reason}</p>
                <h3 style={{ color: "var(--rt-ink-2)", fontSize: 13, margin: "0 0 6px" }}>Evidence</h3>
                <ul style={{ color: "var(--rt-muted-2)", fontSize: 13, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
                  {report.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ul>
                <p style={{ color: "var(--rt-muted)", fontSize: 12, lineHeight: 1.5, margin: "10px 0 0" }}>
                  Policy {report.policy} · deterministic code, not an LLM.
                </p>
                {report.issues.length > 0 && (
                  <details style={{ color: "var(--rt-muted-2)", fontSize: 12, marginTop: 10 }}>
                    <summary>Verifier findings ({report.issues.length})</summary>
                    <ul style={{ lineHeight: 1.5, paddingLeft: 20 }}>
                      {report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {verifyError && <p role="alert" style={{ color: "var(--rt-flag)", marginBottom: 0 }}>Replay-check error: {verifyError}</p>}
          </section>
        )}

        <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, marginTop: 16, padding: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Integrity self-test</h2>
          <p style={{ color: "var(--rt-muted-2)", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            Take your last run and claim one extra point. A working verifier must flag it — this is the same path a tampered
            leaderboard submission would take. Your real run stays untouched and can still be saved as a receipt.
          </p>
          <button disabled={!trace || verifying || phase === "running"} onClick={runTamperTest} style={{ ...secondaryButtonStyle, opacity: trace ? 1 : 0.55 }}>
            TAMPER MY RUN (+1 SCORE) → EXPECT FLAG
          </button>
        </section>

        <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, marginTop: 16, padding: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Autonomous game-QA agent</h2>
          <p style={{ color: "var(--rt-muted-2)", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            Run the RivalBot planner across 2 deterministic QA seeds and 3 personality profiles. The suite records the bot&apos;s
            actual actions at fixed 60 Hz, checks finite engine state, legal input/landing/world transitions and monotonic
            score/counters, then compares the bot&apos;s run outputs with an independent replay. This is a regression agent, not an
            LLM, anti-cheat, or identity check.
          </p>
          <button disabled={qaRunning || verifying || phase === "running"} onClick={runRivalQa} style={{ ...buttonStyle, background: qaRunning ? "var(--rt-disabled)" : "var(--rt-pass)" }}>
            {qaRunning ? "RUNNING SIX CASES…" : "RUN SIX-CASE RIVALBOT QA SUITE"}
          </button>
          {qaError && <p role="alert" style={{ color: "var(--rt-flag)", marginBottom: 0 }}>{qaError}</p>}
          {qaResult && (
            <div aria-live="polite" role="status" style={{ background: "var(--rt-bg)", border: `1px solid ${qaResult.summary.flagged === 0 ? "var(--rt-pass-line)" : "var(--rt-flag-line)"}`, borderRadius: 8, marginTop: 12, padding: 14 }}>
              <p style={{ color: qaResult.summary.flagged === 0 ? "var(--rt-pass)" : "var(--rt-flag)", font: `800 16px ${MONO}`, margin: "0 0 6px" }}>
                {qaResult.summary.flagged === 0 ? "PASS" : "FLAG"} · {qaResult.summary.passed}/{qaResult.summary.total} cases passed · {qaResult.summary.flagged} flagged
              </p>
              <p style={{ color: "var(--rt-muted)", fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>
                Build {qaResult.buildId} · {qaResult.fixedTickHz} Hz · {qaResult.summary.invariantIssueCount} invariant findings · {qaResult.ruleset}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {qaResult.cases.map((qaCase) => (
                  <details key={`${qaCase.seed.date}-${qaCase.seed.symbol}-${qaCase.profile.id}`} style={{ border: "1px solid var(--rt-hairline)", borderRadius: 6, padding: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13 }}>
                      {qaCase.verdict} · {qaCase.seed.symbol} · {qaCase.profile.label} · {qaCase.ticks} ticks
                    </summary>
                    <p style={{ color: "var(--rt-muted-2)", fontSize: 12, lineHeight: 1.5 }}>{qaCase.reason}</p>
                    <ul style={{ color: "var(--rt-muted-2)", fontSize: 12, lineHeight: 1.5, margin: 0, paddingLeft: 18 }}>
                      {qaCase.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                    </ul>
                    <p style={{ color: "var(--rt-muted)", fontSize: 11, lineHeight: 1.5 }}>
                      Seed {qaCase.seed.date}/{qaCase.seed.symbol} · Profile {qaCase.profile.id} · Ruleset {qaCase.ruleset} · Build {qaCase.buildId}. Full trace is included in this result and can be downloaded.
                    </p>
                    <button onClick={() => downloadJson(qaCase.trace, `runtrace-qa-${qaCase.seed.symbol.toLowerCase()}-${qaCase.profile.id}.json`)} style={{ ...secondaryButtonStyle, fontSize: 12, padding: "8px 10px" }}>
                      DOWNLOAD CASE TRACE
                    </button>
                  </details>
                ))}
              </div>
              {qaResult.findings.length > 0 && <p style={{ color: "var(--rt-flag)", fontSize: 12, marginBottom: 0 }}>Each flagged finding carries its seed, profile, ruleset/build ID, replay report, and complete RunTrace input trace.</p>}
            </div>
          )}
        </section>

        <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, marginTop: 16, padding: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Recent receipts</h2>
          <p style={{ color: "var(--rt-muted-2)", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            Stored runs on this deployment{recentStore ? ` (${recentStore} store)` : ""}. Each link re-runs the stored trace on request.
          </p>
          {recent.length === 0 ? (
            <p style={{ color: "var(--rt-muted)", fontSize: 13, margin: 0 }}>No receipts yet — finish a run and save it.</p>
          ) : (
            <ul style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
              {recent.map((run) => (
                <li key={run.id} style={{ alignItems: "center", border: "1px solid var(--rt-hairline)", borderRadius: 6, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", padding: "8px 10px" }}>
                  <span style={{ font: `12px ${MONO}`, color: run.decision === "ACCEPT" ? "var(--rt-pass)" : "var(--rt-flag)" }}>
                    {run.decision}
                  </span>
                  <span style={{ font: `12px ${MONO}`, color: "var(--rt-muted-2)" }}>
                    {run.seed.symbol} {run.seed.date} · score {run.claims.score} · {run.ticks} ticks
                  </span>
                  <a href={`/runproof/r/${run.id}`} style={{ font: `12px ${MONO}`, color: "var(--rt-ink)" }}>OPEN ↗</a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", marginTop: 18 }}>
          <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Controls and capture</h2>
            <p style={{ color: "var(--rt-muted-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Space / ↑ / W or tap and hold the game area to jump. Hold Shift for RUSH. Browser input is queued and stamped when the
              fixed 1/60-second simulation step consumes it; visual frame timing is never used as evidence.
            </p>
          </section>
          <section style={{ background: "var(--rt-panel)", border: "1px solid var(--rt-hairline)", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>What a receipt proves</h2>
            <p style={{ color: "var(--rt-muted-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              That this input log, replayed on the server-signed market level, produces exactly the stored score, jumps, landings and
              scoring events. It does not prove who played, does not identify a wallet, and creates no zero-knowledge proof. Terrain
              with no run token is labeled unattested and cannot become a receipt.
            </p>
          </section>
        </div>

        <p style={{ color: "var(--rt-muted)", fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>
          Full game: <a href="/play" style={{ color: "var(--rt-muted-2)" }}>/play</a> · Leaderboard: <a href="/leaderboard" style={{ color: "var(--rt-muted-2)" }}>/leaderboard</a> ·
          {" "}API: <code>POST /api/runproof/verify</code>, <code>POST /api/runproof/runs</code>
        </p>
    </ProtocolShell>
  );
}
