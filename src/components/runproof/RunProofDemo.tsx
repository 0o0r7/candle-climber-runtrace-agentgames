"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Engine, VIEW_H, VIEW_W } from "@/game/cc/engine";
import { buildPlatforms } from "@/game/cc/level";
import { dailyMutation } from "@/game/cc/mutations";
import { render } from "@/game/cc/render";
import { DEMO_SEED, DEMO_TERRAIN_KIND, makeDemoCandles } from "@/game/runproof/demo-data";
import { runRivalBotQaSuite, type RivalQaSuite } from "@/game/runproof/rival-qa";
import { FixedTickInputRecorder } from "@/game/runproof/recorder";
import { deriveClaims } from "@/game/runproof/verify";
import {
  FIXED_DT,
  FIXED_TICK_HZ,
  RECORDER_FORMAT,
  RECORDER_ID,
  type InputAction,
  type RunProofClaims,
  type RunProofReport,
  type RunProofTrace,
  type ScoreEvent,
} from "@/game/runproof/types";
import type { RunResult } from "@/game/cc/types";

const CANDLES = makeDemoCandles();
const MUTATION = dailyMutation(DEMO_SEED.date + DEMO_SEED.symbol);
const SEED_STR = DEMO_SEED.date + DEMO_SEED.symbol;
const RECORDER_META = {
  format: RECORDER_FORMAT,
  id: RECORDER_ID,
  version: 1,
  tickHz: FIXED_TICK_HZ,
} as const;

type DemoCase = "valid" | "altered-score" | "impossible-action";

function makeDemoTrace(demoCase: DemoCase): RunProofTrace {
  const inputs = demoCase === "valid"
    ? [
      { tick: 19, action: "jump-down" as const },
      { tick: 27, action: "jump-up" as const },
      { tick: 67, action: "jump-down" as const },
      { tick: 75, action: "jump-up" as const },
    ]
    : demoCase === "impossible-action"
      ? [{ tick: 0, action: "enter-world2" as const }]
      : [];
  const traceBase = {
    format: "runproof/v1" as const,
    prototype: true as const,
    recorder: RECORDER_META,
    seed: { ...DEMO_SEED },
    terrain: { kind: DEMO_TERRAIN_KIND, candles: CANDLES },
    mutationId: MUTATION.id,
    ticks: 120,
    inputs,
  };
  const claims = deriveClaims(traceBase);
  if (demoCase === "altered-score") claims.score += 1;
  return { ...traceBase, claims };
}

type Phase = "idle" | "running" | "finished";

function downloadJson(trace: RunProofTrace, suggestedName?: string): void {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName ?? `runtrace-v1-${trace.seed.symbol.toLowerCase()}-${trace.ticks}ticks.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function RunProofDemo() {
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [hud, setHud] = useState({ score: 0, candlesPassed: 0, tick: 0 });
  const [trace, setTrace] = useState<RunProofTrace | null>(null);
  const [report, setReport] = useState<RunProofReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResult, setQaResult] = useState<RivalQaSuite | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);

  const setCurrentPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const startRun = () => {
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
    setVerifyError(null);
    setHud({ score: 0, candlesPassed: 0, tick: 0 });

    engineRef.current = new Engine(buildPlatforms(CANDLES, SEED_STR), {
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
    }, MUTATION.mods, SEED_STR);
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

    const finishRun = (engine: Engine) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const result = resultRef.current;
      const recorder = recorderRef.current;
      if (!result || !recorder) return;
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
        prototype: true,
        recorder: RECORDER_META,
        seed: { ...DEMO_SEED },
        terrain: { kind: DEMO_TERRAIN_KIND, candles: CANDLES },
        mutationId: MUTATION.id,
        ticks: recorder.tick,
        inputs: recorder.snapshot(),
        claims,
      };
      setTrace(finishedTrace);
      setHud({ score: result.score, candlesPassed: result.candlesPassed, tick: recorder.tick });
      setCurrentPhase("finished");
      void engine;
    };

    const frame = (now: number) => {
      const engine = engineRef.current;
      if (lastTime === 0) lastTime = now;
      let elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
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
          if (currentEngine.dead) finishRun(currentEngine);
        }
      } else {
        accumulator = 0;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rect = canvas.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);
      context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
      if (engine) {
        render(context, engine, SEED_STR, MUTATION.id);
      } else {
        context.fillStyle = "#0b0d0f";
        context.fillRect(0, 0, VIEW_W, VIEW_H);
        context.fillStyle = "#ccff00";
        context.font = "700 26px ui-monospace, SFMono-Regular, Menlo, monospace";
        context.fillText("RUNTRACE / LOCAL DEMO", 36, 66);
        context.fillStyle = "#b5bbc1";
        context.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
        context.fillText("Start a run to record real input at 60 Hz", 36, 98);
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

  const verifyTraceLocally = async (candidate: RunProofTrace) => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    setReport(null);
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
      setVerifyError(error instanceof Error ? error.message : "Local replay check failed.");
    } finally {
      setVerifying(false);
    }
  };

  const verifyRun = () => {
    if (trace) void verifyTraceLocally(trace);
  };

  const runDemoCase = (demoCase: DemoCase) => {
    const demoTrace = makeDemoTrace(demoCase);
    setTrace(demoTrace);
    void verifyTraceLocally(demoTrace);
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
        setQaError(error instanceof Error ? error.message : "The local RivalBot QA suite failed.");
      } finally {
        setQaRunning(false);
      }
    }, 0);
  };

  const buttonStyle: CSSProperties = {
    background: "#ccff00",
    border: 0,
    borderRadius: 6,
    color: "#10120b",
    cursor: "pointer",
    font: "700 14px ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "11px 15px",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#090b0d", color: "#f1f3f4", fontFamily: "system-ui, sans-serif", padding: "24px 16px 48px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <p style={{ color: "#ccff00", font: "700 12px ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".13em", margin: "0 0 8px" }}>CONTEST BUILD · DETERMINISTIC REPLAY</p>
        <h1 style={{ fontSize: "clamp(30px, 6vw, 52px)", letterSpacing: "-.04em", lineHeight: 1, margin: "0 0 12px" }}>RunTrace</h1>
        <p style={{ color: "#b5bbc1", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 760 }}>
          <strong style={{ color: "#f1f3f4" }}>Deterministic replay-consistency check. No cryptographic proof.</strong> RunTrace records fixed-tick inputs and replays them against this branch&apos;s Candle Climber engine, returning an ACCEPT or FLAG with concise reason and evidence. Its optional RivalBot QA suite is also deterministic rule-based code, not an AI/LLM model.
        </p>

        <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: "12px 16px" }}>
            <div style={{ color: "#c4cbd0", font: "12px ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {phase === "running" ? "RUNNING · INPUTS CAPTURED AT 60 HZ" : phase === "finished" ? "RUN ENDED · TRACE READY" : "READY · SYNTHETIC LOCAL TERRAIN"}
            </div>
            <div style={{ color: "#f1f3f4", font: "12px ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              SCORE {hud.score} · CANDLES {hud.candlesPassed} · TICK {hud.tick}
            </div>
          </div>
          <canvas
            ref={canvasRef}
            aria-label="RunTrace Candle Climber demo canvas"
            onPointerDown={onCanvasPointerDown}
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, background: "#0b0d0f", display: "block", touchAction: "none", width: "100%" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 16 }}>
            {phase !== "running" && <button onClick={startRun} style={buttonStyle}>{phase === "finished" ? "PLAY ANOTHER RUN" : "START DEMO RUN"}</button>}
            {trace && <button onClick={() => void verifyRun()} disabled={verifying} style={{ ...buttonStyle, background: verifying ? "#626a70" : "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>{verifying ? "REPLAYING…" : "REPLAY-CHECK LOCALLY"}</button>}
            {trace && <button onClick={() => downloadJson(trace)} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>DOWNLOAD JSON</button>}
          </div>
        </section>

        <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>One-click policy demos</h2>
          <p style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            Each button submits a prepared trace to the local verifier and shows the policy verdict and evidence.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button disabled={verifying || phase === "running"} onClick={() => runDemoCase("valid")} style={buttonStyle}>VALID TRACE → ACCEPT</button>
            <button disabled={verifying || phase === "running"} onClick={() => runDemoCase("altered-score")} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>ALTERED SCORE → FLAG</button>
            <button disabled={verifying || phase === "running"} onClick={() => runDemoCase("impossible-action")} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>IMPOSSIBLE ACTION → FLAG</button>
          </div>
        </section>

        <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Autonomous deterministic game-QA agent</h2>
          <p style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            Run the existing RivalBot planner across 2 synthetic seeds and 3 existing personality profiles. The suite records the bot&apos;s actual actions at fixed 60 Hz, checks finite engine state, legal input/landing/world transitions and monotonic score/counters, then compares the bot&apos;s run outputs with RunTrace replay. This is a local regression/consistency check, not independent physics proof, an LLM, anti-cheat, or identity verification.
          </p>
          <button disabled={qaRunning || verifying || phase === "running"} onClick={runRivalQa} style={{ ...buttonStyle, background: qaRunning ? "#626a70" : "#ccff00" }}>
            {qaRunning ? "RUNNING SIX LOCAL CASES…" : "RUN SIX-CASE RIVALBOT QA SUITE"}
          </button>
          {qaError && <p role="alert" style={{ color: "#ff9a8b", marginBottom: 0 }}>{qaError}</p>}
          {qaResult && (
            <div aria-live="polite" role="status" style={{ background: "#090b0d", border: `1px solid ${qaResult.summary.flagged === 0 ? "#687c18" : "#75443e"}`, borderRadius: 8, marginTop: 12, padding: 14 }}>
              <p style={{ color: qaResult.summary.flagged === 0 ? "#ccff00" : "#ff9a8b", font: "800 16px ui-monospace, SFMono-Regular, Menlo, monospace", margin: "0 0 6px" }}>
                {qaResult.summary.flagged === 0 ? "PASS" : "FLAG"} · {qaResult.summary.passed}/{qaResult.summary.total} cases passed · {qaResult.summary.flagged} flagged
              </p>
              <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>
                Build {qaResult.buildId} · {qaResult.fixedTickHz} Hz · {qaResult.summary.invariantIssueCount} invariant findings · {qaResult.ruleset}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {qaResult.cases.map((qaCase) => (
                  <details key={`${qaCase.seed.date}-${qaCase.seed.symbol}-${qaCase.profile.id}`} style={{ border: "1px solid #283036", borderRadius: 6, padding: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13 }}>
                      {qaCase.verdict} · {qaCase.seed.symbol} · {qaCase.profile.label} · {qaCase.ticks} ticks
                    </summary>
                    <p style={{ color: "#b5bbc1", fontSize: 12, lineHeight: 1.5 }}>{qaCase.reason}</p>
                    <ul style={{ color: "#b5bbc1", fontSize: 12, lineHeight: 1.5, margin: 0, paddingLeft: 18 }}>
                      {qaCase.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                    </ul>
                    <p style={{ color: "#79838a", fontSize: 11, lineHeight: 1.5 }}>
                      Seed {qaCase.seed.date}/{qaCase.seed.symbol} · Profile {qaCase.profile.id} · Ruleset {qaCase.ruleset} · Build {qaCase.buildId}. Full trace is included in this result and can be downloaded.
                    </p>
                    <button onClick={() => downloadJson(qaCase.trace, `runtrace-qa-${qaCase.seed.symbol.toLowerCase()}-${qaCase.profile.id}.json`)} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4", fontSize: 12, padding: "8px 10px" }}>
                      DOWNLOAD CASE TRACE
                    </button>
                  </details>
                ))}
              </div>
              {qaResult.findings.length > 0 && <p style={{ color: "#ff9a8b", fontSize: 12, marginBottom: 0 }}>Each flagged finding carries its seed, profile, ruleset/build ID, replay report, and complete RunTrace input trace.</p>}
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", marginTop: 18 }}>
          <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Controls and capture</h2>
            <p style={{ color: "#b5bbc1", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Space / ↑ / W or tap and hold the game area to jump. Hold Shift for RUSH. Browser input is queued and stamped when the fixed 1/60-second simulation step consumes it; visual frame timing is not used as evidence.
            </p>
          </section>
          <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Deterministic policy and limits</h2>
            <p style={{ color: "#b5bbc1", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              This ACCEPT/FLAG policy is deterministic code, not an LLM. The fixture is synthetic, not market data; submitted terrain provenance and input origin are not authenticated. A result never identifies or proves a human player. There is no cryptographic or zk proof, wallet signature, zkVerify submission, or leaderboard enforcement; traces remain editable and fabricable.
            </p>
          </section>
        </div>

        {trace && (
          <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Task input trace</h2>
            <p style={{ color: "#b5bbc1", fontSize: 13, margin: "0 0 10px" }}>
              {trace.format} · {trace.recorder?.format} · {trace.ticks} fixed ticks · {trace.inputs.length} recorded input events · {trace.terrain.candles.length} synthetic candles
            </p>
            {verifying && <p role="status" style={{ color: "#b5bbc1", marginBottom: 0 }}>Running the deterministic policy…</p>}
            {report && (
              <div aria-live="polite" role="status" style={{ background: "#090b0d", border: `1px solid ${report.decision === "ACCEPT" ? "#687c18" : "#75443e"}`, borderRadius: 8, marginTop: 12, padding: 14 }}>
                <p style={{ color: report.decision === "ACCEPT" ? "#ccff00" : "#ff9a8b", font: "800 18px ui-monospace, SFMono-Regular, Menlo, monospace", margin: "0 0 8px" }}>
                  {report.decision} · {report.task}
                </p>
                <p style={{ color: "#f1f3f4", lineHeight: 1.5, margin: "0 0 10px" }}>{report.reason}</p>
                <h3 style={{ color: "#c4cbd0", fontSize: 13, margin: "0 0 6px" }}>Evidence</h3>
                <ul style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
                  {report.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ul>
                <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.5, margin: "10px 0 0" }}>
                  Policy {report.policy} · deterministic code, not an LLM.
                </p>
                {report.issues.length > 0 && (
                  <details style={{ color: "#b5bbc1", fontSize: 12, marginTop: 10 }}>
                    <summary>Additional verifier findings ({report.issues.length})</summary>
                    <ul style={{ lineHeight: 1.5, paddingLeft: 20 }}>
                      {report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {verifyError && <p role="alert" style={{ color: "#ff9a8b", marginBottom: 0 }}>Local replay-check error: {verifyError}</p>}
          </section>
        )}

        <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>
          Local demo route: <code>/runproof</code> (internal path retained). The normal <code>/play</code> route and its APIs are not modified. RunTrace makes no request to a wallet, market feed, zkVerify, or external verifier.
        </p>
      </div>
    </main>
  );
}
