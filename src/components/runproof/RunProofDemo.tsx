"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Engine, VIEW_H, VIEW_W } from "@/game/cc/engine";
import { buildPlatforms } from "@/game/cc/level";
import { dailyMutation } from "@/game/cc/mutations";
import { render } from "@/game/cc/render";
import { DEMO_SEED, DEMO_TERRAIN_KIND, makeDemoCandles } from "@/game/runproof/demo-data";
import { createRunTraceReportBundle, parseRunTraceJson, RUNTRACE_REPORT_BUNDLE_FORMAT } from "@/game/runproof/trace-io";
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
import { RUNPROOF_MAX_BODY_BYTES } from "@/game/runproof/http-guard";

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

function downloadJson(value: unknown, suggestedName = "runtrace-v1-trace.json"): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function summarizeTrace(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "JSON object · the verifier will check the trace schema";
  }
  const candidate = value as Record<string, unknown>;
  const format = typeof candidate.format === "string" ? candidate.format : "unknown format";
  const ticks = Number.isSafeInteger(candidate.ticks) ? `${candidate.ticks} fixed ticks` : "unknown tick count";
  const inputs = Array.isArray(candidate.inputs) ? `${candidate.inputs.length} input events` : "unknown input count";
  const terrain = typeof candidate.terrain === "object" && candidate.terrain !== null
    ? (candidate.terrain as Record<string, unknown>).candles
    : null;
  const candles = Array.isArray(terrain) ? `${terrain.length} terrain records` : "unknown terrain size";
  return `${format} · ${ticks} · ${inputs} · ${candles}`;
}

export default function RunProofDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const traceFileInputRef = useRef<HTMLInputElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const recorderRef = useRef<FixedTickInputRecorder | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const finishedRef = useRef(false);
  const resultRef = useRef<RunResult | null>(null);
  const jumpTicksRef = useRef<number[]>([]);
  const landTicksRef = useRef<number[]>([]);
  const scoreEventsRef = useRef<ScoreEvent[]>([]);
  const pressedRef = useRef(new Set<string>());
  const mobilePointerActionsRef = useRef(new Map<number, "jump" | "rush">());
  const [phase, setPhase] = useState<Phase>("idle");
  const [hud, setHud] = useState({ score: 0, candlesPassed: 0, tick: 0 });
  const [trace, setTrace] = useState<unknown | null>(null);
  const [traceSource, setTraceSource] = useState("");
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
    mobilePointerActionsRef.current.clear();
    finishedRef.current = false;
    setTrace(null);
    setTraceSource("");
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

  const onMobileControlPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, action: "jump" | "rush") => {
    event.preventDefault();
    if (phaseRef.current !== "running" || finishedRef.current || mobilePointerActionsRef.current.has(event.pointerId)) return;
    if ([...mobilePointerActionsRef.current.values()].includes(action)) return;
    mobilePointerActionsRef.current.set(event.pointerId, action);
    recorderRef.current?.queue(action === "jump" ? "jump-down" : "rush-down");
  };

  const releaseMobileControl = (pointerId: number) => {
    const action = mobilePointerActionsRef.current.get(pointerId);
    if (!action) return;
    mobilePointerActionsRef.current.delete(pointerId);
    if (phaseRef.current === "running" && !finishedRef.current) {
      recorderRef.current?.queue(action === "jump" ? "jump-up" : "rush-up");
    }
  };

  const releaseAllPointerInputs = () => {
    if (pressedRef.current.has("pointer")) {
      pressedRef.current.delete("pointer");
      if (phaseRef.current === "running" && !finishedRef.current) recorderRef.current?.queue("jump-up");
    }
    for (const pointerId of mobilePointerActionsRef.current.keys()) releaseMobileControl(pointerId);
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
      setTraceSource("Captured play session");
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
        context.fillText("RUNTRACE / QA WORKBENCH", 36, 66);
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
    const pointerUp = (event: globalThis.PointerEvent) => {
      if (pressedRef.current.has("pointer")) {
        pressedRef.current.delete("pointer");
        if (phaseRef.current === "running" && !finishedRef.current) recorderRef.current?.queue("jump-up");
      }
      releaseMobileControl(event.pointerId);
    };
    const blur = () => releaseAllPointerInputs();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "running" || finishedRef.current || pressedRef.current.has("pointer")) return;
    event.preventDefault();
    pressedRef.current.add("pointer");
    recorderRef.current?.queue("jump-down");
  };

  const verifyTraceLocally = async (candidate: unknown) => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    setReport(null);
    try {
      const body = JSON.stringify(candidate);
      if (typeof body !== "string") throw new Error("Trace could not be serialized as JSON.");
      if (new TextEncoder().encode(body).byteLength > RUNPROOF_MAX_BODY_BYTES) {
        throw new Error(`Serialized trace exceeds the ${RUNPROOF_MAX_BODY_BYTES.toLocaleString("en-US")} byte request limit.`);
      }
      const response = await fetch("/api/runproof/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
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
    setTraceSource("Built-in policy fixture");
    void verifyTraceLocally(demoTrace);
  };

  const importTraceFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setReport(null);
    setVerifyError(null);
    setTrace(null);
    setTraceSource("");
    if (file.size > RUNPROOF_MAX_BODY_BYTES) {
      setVerifyError(`Trace file exceeds the ${RUNPROOF_MAX_BODY_BYTES.toLocaleString("en-US")} byte limit.`);
      return;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > RUNPROOF_MAX_BODY_BYTES) {
        throw new RangeError(`Trace file exceeds the ${RUNPROOF_MAX_BODY_BYTES.toLocaleString("en-US")} byte limit.`);
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new TypeError("Trace file must use valid UTF-8 encoding.");
      }
      const imported = parseRunTraceJson(text);
      setTrace(imported);
      setTraceSource(file.name);
      await verifyTraceLocally(imported);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "Could not read this trace file.");
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
        <p style={{ color: "#ccff00", font: "700 12px ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".13em", margin: "0 0 8px" }}>CONTEST BRANCH · LOCAL ONLY</p>
        <h1 style={{ fontSize: "clamp(30px, 6vw, 52px)", letterSpacing: "-.04em", lineHeight: 1, margin: "0 0 12px" }}>RunTrace</h1>
        <p style={{ color: "#b5bbc1", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 760 }}>
          <strong style={{ color: "#f1f3f4" }}>Deterministic replay-consistency check. No cryptographic proof.</strong> RunTrace records fixed-tick inputs and replays them against this branch&apos;s Candle Climber engine, returning an ACCEPT or FLAG with concise reason and evidence. Its optional RivalBot QA suite is also deterministic rule-based code, not an AI/LLM model.
        </p>

        <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: "12px 16px" }}>
            <div style={{ color: "#c4cbd0", font: "12px ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {phase === "running" ? "RUNNING · INPUTS CAPTURED AT 60 HZ" : phase === "finished" ? "RUN ENDED · TRACE READY" : trace ? "TRACE READY FOR LOCAL REPLAY" : "READY · SYNTHETIC LOCAL TERRAIN"}
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
          <div aria-label="Touch game controls" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", padding: "0 16px 14px" }}>
            <button
              type="button"
              disabled={phase !== "running"}
              onPointerDown={(event) => onMobileControlPointerDown(event, "jump")}
              aria-label="Hold to jump"
              style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4", opacity: phase === "running" ? 1 : 0.55, touchAction: "none", userSelect: "none" }}
            >
              HOLD TO JUMP
            </button>
            <button
              type="button"
              disabled={phase !== "running"}
              onPointerDown={(event) => onMobileControlPointerDown(event, "rush")}
              aria-label="Hold to activate RUSH"
              style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4", opacity: phase === "running" ? 1 : 0.55, touchAction: "none", userSelect: "none" }}
            >
              HOLD FOR RUSH
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 16 }}>
            {phase !== "running" && <button onClick={startRun} style={buttonStyle}>{phase === "finished" ? "PLAY ANOTHER RUN" : "START PLAYTEST RUN"}</button>}
            {trace !== null && <button onClick={() => void verifyRun()} disabled={verifying} style={{ ...buttonStyle, background: verifying ? "#626a70" : "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>{verifying ? "REPLAYING…" : "REPLAY-CHECK LOCALLY"}</button>}
            {trace !== null && <button onClick={() => downloadJson(trace)} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>DOWNLOAD TRACE JSON</button>}
            <button type="button" disabled={verifying || qaRunning || phase === "running"} onClick={() => traceFileInputRef.current?.click()} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>IMPORT TRACE JSON</button>
            <input ref={traceFileInputRef} aria-label="Choose a RunTrace JSON file" type="file" accept="application/json,.json" onChange={importTraceFile} style={{ display: "none" }} />
            {trace !== null && report !== null && <button onClick={() => downloadJson(createRunTraceReportBundle(trace, report), "runtrace-review-bundle-v1.json")} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>DOWNLOAD REVIEW BUNDLE</button>}
          </div>
          <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.5, margin: "-4px 16px 14px" }}>
            Imported JSON is sent to this same-origin replay endpoint for checking and is not stored by this route. Review bundles contain the trace and report but are editable files, not attestations.
          </p>
          {verifyError && <p role="alert" style={{ color: "#ff9a8b", fontSize: 13, lineHeight: 1.5, margin: "0 16px 14px" }}>Import or replay error: {verifyError}</p>}
        </section>

        <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Verifier test vectors</h2>
          <p style={{ color: "#b5bbc1", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            Prepared test traces exercise the verifier; bring your own captured or exported trace with Import Trace JSON.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button disabled={verifying || phase === "running"} onClick={() => runDemoCase("valid")} style={buttonStyle}>VALID TRACE TEST → ACCEPT</button>
            <button disabled={verifying || phase === "running"} onClick={() => runDemoCase("altered-score")} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>ALTERED SCORE TEST → FLAG</button>
            <button disabled={verifying || phase === "running"} onClick={() => runDemoCase("impossible-action")} style={{ ...buttonStyle, background: "#20272c", border: "1px solid #526068", color: "#f1f3f4" }}>IMPOSSIBLE ACTION TEST → FLAG</button>
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
              Space / ↑ / W or tap and hold the game area to jump; hold Shift for RUSH. On touch screens, use the hold-to-jump and hold-for-RUSH buttons. Inputs are stamped when the fixed 1/60-second simulation step consumes them, not by visual frame timing.
            </p>
          </section>
          <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Deterministic policy and limits</h2>
            <p style={{ color: "#b5bbc1", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              This ACCEPT/FLAG policy is deterministic code, not an LLM. The fixture is synthetic, not market data; submitted terrain provenance and input origin are not authenticated. A result never identifies or proves a human player. There is no cryptographic or zk proof, wallet signature, zkVerify submission, or leaderboard enforcement; traces remain editable and fabricable.
            </p>
          </section>
        </div>

        {trace !== null && (
          <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, marginTop: 16, padding: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Task input trace</h2>
            <p style={{ color: "#b5bbc1", fontSize: 13, margin: "0 0 10px" }}>
              Source: {traceSource || "RunTrace"} · {summarizeTrace(trace)}
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
                  Policy {report.policy} · deterministic code, not an LLM. Export format: {RUNTRACE_REPORT_BUNDLE_FORMAT}.
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
          </section>
        )}

        <p style={{ color: "#79838a", fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>
          Local workbench route: <code>/runproof</code> (internal path retained). The normal <code>/play</code> route and its APIs are not modified. RunTrace makes no request to a wallet, market feed, zkVerify, or external verifier.
        </p>
      </div>
    </main>
  );
}
