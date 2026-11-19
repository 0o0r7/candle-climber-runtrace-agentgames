"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Autopilot } from "@/game/cc/autopilot";
import { Engine, VIEW_H, VIEW_W } from "@/game/cc/engine";
import { buildPlatforms } from "@/game/cc/level";
import { dailyMutation } from "@/game/cc/mutations";
import { render } from "@/game/cc/render";
import type { CandleData, RunResult } from "@/game/cc/types";
import {
  FIXED_DT,
  FIXED_TICK_HZ,
  RECORDER_FORMAT,
  RECORDER_ID,
  type InputAction,
  type InputEvent,
  type RunProofClaims,
  type RunProofReport,
  type RunProofTrace,
  type RunReceipt,
  type RunReceiptSummary,
  type ScoreEvent,
} from "@/game/runproof/types";
import ShowcaseProofPanel from "./ShowcaseProofPanel";
import type { ShowcaseProof, ShowcaseRecheck, ShowcaseReceipt, ShowcaseStage } from "./showcase-types";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const RECORDER_META = {
  format: RECORDER_FORMAT,
  id: RECORDER_ID,
  version: 1,
  tickHz: FIXED_TICK_HZ,
} as const;

/** A take longer than this is cut and verified as-is (60 s). */
const MAX_TAKE_TICKS = 60 * FIXED_TICK_HZ;
/** Pause on the death frame before the loop restarts, then fade back in. */
const REPLAY_HOLD_S = 1.3;
const FADE_S = 0.4;

const STAGE_LABEL: Record<ShowcaseStage, string> = {
  loading: "LOADING TODAY'S SIGNED MARKET LEVEL…",
  recording: "TAKE · AGENT RECORDING REAL INPUT AT 60 HZ",
  verifying: "TAKE COMPLETE · SERVER REPLAYING THE TRACE",
  replaying: "REPLAYING THE VERIFIED TRACE · REAL GAMEPLAY, NOT A VIDEO",
  error: "MARKET TERRAIN UNAVAILABLE",
};

function applyAction(engine: Engine, action: InputAction) {
  if (action === "jump-down") engine.press();
  else if (action === "jump-up") engine.release();
  else if (action === "rush-down") engine.pressRush();
  else if (action === "rush-up") engine.releaseRush();
  else if (action === "enter-world2" && engine.graduated) engine.enterWorld2();
}

async function postVerify(body: unknown): Promise<RunProofReport> {
  const response = await fetch("/api/runproof/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as (RunProofReport & { error?: string }) | null;
  if (!payload || !payload.decision) {
    throw new Error(payload?.error ?? `HTTP ${response.status}`);
  }
  return payload;
}

interface ReplayState {
  engine: Engine;
  trace: RunProofTrace;
  tick: number;
  index: number;
  hold: number;
  fade: number;
}

export default function RunTraceShowcase() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<CandleData | null>(null);
  const seedStrRef = useRef("");
  const mutationRef = useRef<ReturnType<typeof dailyMutation> | null>(null);
  const pilotRef = useRef<Autopilot | null>(null);
  const replayRef = useRef<ReplayState | null>(null);
  const tickRef = useRef(0);
  const deathRef = useRef<RunResult | null>(null);
  const jumpTicksRef = useRef<number[]>([]);
  const landTicksRef = useRef<number[]>([]);
  const scoreEventsRef = useRef<ScoreEvent[]>([]);
  const inputsRef = useRef<InputEvent[]>([]);
  const finishedRef = useRef(false);
  const stageRef = useRef<ShowcaseStage>("loading");
  const hudRef = useRef({ score: 0, candlesPassed: 0, tick: 0 });
  const bootedRef = useRef(false);

  const [stage, setStage] = useState<ShowcaseStage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState({ score: 0, candlesPassed: 0, tick: 0 });
  const [terrain, setTerrain] = useState<CandleData | null>(null);
  const [trace, setTrace] = useState<RunProofTrace | null>(null);
  const [report, setReport] = useState<RunProofReport | null>(null);
  const [tamper, setTamper] = useState<RunProofReport | null>(null);
  const [receipt, setReceipt] = useState<ShowcaseReceipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [recheck, setRecheck] = useState<ShowcaseRecheck | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);

  const updateHud = useCallback((engine: Engine, tick: number) => {
    const next = { score: Math.floor(engine.score), candlesPassed: engine.candlesPassed, tick };
    const prev = hudRef.current;
    if (prev.score === next.score && prev.candlesPassed === next.candlesPassed && prev.tick === next.tick) return;
    hudRef.current = next;
    setHud(next);
  }, []);

  const startTake = useCallback(() => {
    const data = terrainRef.current;
    const mutation = mutationRef.current;
    if (!data || !mutation) return;
    const seedStr = seedStrRef.current;

    tickRef.current = 0;
    deathRef.current = null;
    jumpTicksRef.current = [];
    landTicksRef.current = [];
    scoreEventsRef.current = [];
    inputsRef.current = [];
    finishedRef.current = false;
    replayRef.current = null;
    pilotRef.current = null;
    hudRef.current = { score: 0, candlesPassed: 0, tick: 0 };
    setHud(hudRef.current);
    setTrace(null);
    setReport(null);
    setTamper(null);
    setReceipt(null);
    setReceiptError(null);
    setRecheck(null);
    setRecheckError(null);
    setCycle(0);

    let engine: Engine;
    engine = new Engine(
      buildPlatforms(data.candles, seedStr),
      {
        onDeath: (result) => {
          deathRef.current = result;
        },
        onScore: (score, combo) => {
          scoreEventsRef.current.push({ tick: tickRef.current, score, combo, candlesPassed: engine.candlesPassed });
        },
        onSfx: (name) => {
          if (name === "jump") jumpTicksRef.current.push(tickRef.current);
          if (name === "land") landTicksRef.current.push(tickRef.current);
        },
      },
      mutation.mods,
      seedStr,
    );

    pilotRef.current = new Autopilot(data.candles, seedStr, {
      mods: mutation.mods,
      engine,
      observer: (action, tick) => {
        inputsRef.current.push({ tick, action });
      },
    });

    stageRef.current = "recording";
    setStage("recording");
  }, []);

  const loadTerrain = useCallback(async () => {
    stageRef.current = "loading";
    setStage("loading");
    setError(null);
    try {
      const response = await fetch("/api/candles", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as CandleData | { error?: string } | null;
      if (!response.ok || !payload || !("candles" in payload) || !Array.isArray(payload.candles) || payload.candles.length < 10) {
        const message = payload && "error" in payload && payload.error ? payload.error : `HTTP ${response.status}`;
        throw new Error(message);
      }
      terrainRef.current = payload;
      seedStrRef.current = payload.seed.date + payload.seed.symbol;
      mutationRef.current = dailyMutation(seedStrRef.current);
      setTerrain(payload);
      startTake();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load market data.");
      stageRef.current = "error";
      setStage("error");
    }
  }, [startTake]);

  const startReplay = useCallback((next: RunProofTrace) => {
    const seedStr = next.seed.date + next.seed.symbol;
    const mutation = dailyMutation(seedStr);
    const engine = new Engine(
      buildPlatforms(next.terrain.candles, seedStr),
      { onDeath: () => {}, onScore: () => {} },
      mutation.mods,
      seedStr,
    );
    replayRef.current = { engine, trace: next, tick: 0, index: 0, hold: 0, fade: FADE_S };
    setCycle((value) => value + 1);
    stageRef.current = "replaying";
    setStage("replaying");
  }, []);

  const publishReceipt = useCallback(async (next: RunProofTrace, fresh: RunProofReport): Promise<ShowcaseReceipt | null> => {
    // Reuse today's receipt for this exact run instead of filling the store
    // with one copy per visitor. The agent is deterministic, so an identical
    // stored run has the same ticks, input count and totals.
    try {
      const listResponse = await fetch("/api/runproof/runs?limit=50", { cache: "no-store" });
      if (listResponse.ok) {
        const list = (await listResponse.json()) as { runs?: RunReceiptSummary[] };
        const existing = (list.runs ?? []).find((row) =>
          row.seed.date === next.seed.date
          && row.seed.symbol === next.seed.symbol
          && row.decision === "ACCEPT"
          && row.terrainAttested
          && row.ticks === next.ticks
          && row.inputCount === next.inputs.length
          && row.claims.score === fresh.replay?.score
          && row.claims.candlesPassed === fresh.replay?.candlesPassed
          && row.claims.bestStreak === fresh.replay?.bestStreak);
        if (existing) return { id: existing.id, reused: true };
      }
    } catch {
      // The reuse check is best-effort; publishing below is the real path.
    }

    const response = await fetch("/api/runproof/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    const payload = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!response.ok || !payload?.id) {
      setReceiptError(payload?.error ?? `HTTP ${response.status}`);
      return null;
    }
    return { id: payload.id, reused: false };
  }, []);

  const recheckReceipt = useCallback(async (id: string, fresh: RunProofReport) => {
    try {
      const response = await fetch(`/api/runproof/runs/${id}`, { cache: "no-store" });
      const stored = (await response.json().catch(() => null)) as (RunReceipt & { error?: string }) | null;
      if (!response.ok || !stored?.trace) throw new Error(stored?.error ?? `HTTP ${response.status}`);
      const again = await postVerify(stored.trace);
      const match = again.decision === fresh.decision
        && again.replay?.score === fresh.replay?.score
        && again.replay?.candlesPassed === fresh.replay?.candlesPassed
        && again.replay?.bestStreak === fresh.replay?.bestStreak;
      setRecheck({ decision: again.decision, match });
    } catch (err) {
      setRecheckError(err instanceof Error ? err.message : "Re-verify failed.");
    }
  }, []);

  const runProofPipeline = useCallback(async (next: RunProofTrace) => {
    try {
      const fresh = await postVerify(next);
      setReport(fresh);

      // Integrity self-test: the same run claiming one extra point must FLAG.
      const tamperReport = await postVerify({ ...next, claims: { ...next.claims, score: next.claims.score + 1 } });
      setTamper(tamperReport);

      if (fresh.decision === "ACCEPT" && next.runToken) {
        const published = await publishReceipt(next, fresh);
        if (published) {
          setReceipt(published);
          void recheckReceipt(published.id, fresh);
        }
      }
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      startReplay(next);
    }
  }, [publishReceipt, recheckReceipt, startReplay]);

  const finishTake = useCallback(() => {
    if (finishedRef.current) return;
    const pilot = pilotRef.current;
    const data = terrainRef.current;
    const mutation = mutationRef.current;
    if (!pilot || !data || !mutation) return;
    finishedRef.current = true;

    const engine = pilot.eng;
    const result = deathRef.current;
    const claims: RunProofClaims = {
      score: result?.score ?? Math.floor(engine.score),
      candlesPassed: result?.candlesPassed ?? engine.candlesPassed,
      bestStreak: result?.bestStreak ?? engine.bestStreak,
      deathCause: result?.cause ?? null,
      jumpTicks: [...jumpTicksRef.current],
      landTicks: [...landTicksRef.current],
      scoreEvents: [...scoreEventsRef.current],
    };
    const built: RunProofTrace = {
      format: "runproof/v1",
      recorder: RECORDER_META,
      seed: { date: data.seed.date, symbol: data.seed.symbol },
      terrain: { kind: `market-${data.seed.source}`, candles: data.candles },
      ...(data.runToken ? { runToken: data.runToken } : {}),
      mutationId: mutation.id,
      ticks: pilot.ticks,
      inputs: [...inputsRef.current],
      claims,
    };

    setTrace(built);
    setHud({ score: claims.score, candlesPassed: claims.candlesPassed, tick: built.ticks });
    stageRef.current = "verifying";
    setStage("verifying");
    void runProofPipeline(built);
  }, [runProofPipeline]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void loadTerrain();
  }, [loadTerrain]);

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

    const draw = (engine: Engine | null, mutationId: string, seedStr: string, overlay: number) => {
      const rect = canvas.getBoundingClientRect();
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
      if (engine) {
        render(context, engine, seedStr, mutationId);
      } else {
        context.fillStyle = "#0b0d0f";
        context.fillRect(0, 0, VIEW_W, VIEW_H);
        context.fillStyle = "#ccff00";
        context.font = `700 26px ${MONO}`;
        context.fillText("RUNTRACE", 36, 66);
        context.fillStyle = "#b5bbc1";
        context.font = `15px ${MONO}`;
        context.fillText("loading today's signed market level…", 36, 98);
      }
      if (overlay > 0) {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = `rgba(9,11,13,${Math.min(1, overlay)})`;
        context.fillRect(0, 0, rect.width, rect.height);
      }
    };

    const frame = (now: number) => {
      animation = requestAnimationFrame(frame);
      if (lastTime === 0) lastTime = now;
      const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      let overlay = 0;

      if (stageRef.current === "recording") {
        accumulator += elapsed;
        const pilot = pilotRef.current;
        if (pilot) {
          while (accumulator >= FIXED_DT) {
            accumulator -= FIXED_DT;
            pilot.tick();
            tickRef.current += 1;
            if (pilot.eng.dead || tickRef.current >= MAX_TAKE_TICKS) {
              finishTake();
              break;
            }
          }
          updateHud(pilot.eng, tickRef.current);
        }
      } else if (stageRef.current === "replaying") {
        accumulator += elapsed;
        const replay = replayRef.current;
        if (replay) {
          while (accumulator >= FIXED_DT) {
            accumulator -= FIXED_DT;
            if (replay.engine.dead || replay.tick >= replay.trace.ticks) break;
            while (replay.index < replay.trace.inputs.length && replay.trace.inputs[replay.index].tick === replay.tick) {
              applyAction(replay.engine, replay.trace.inputs[replay.index].action);
              replay.index += 1;
            }
            replay.engine.step(FIXED_DT);
            replay.tick += 1;
          }

          if (replay.engine.dead || replay.tick >= replay.trace.ticks) {
            replay.hold += elapsed;
            overlay = replay.hold / FADE_S;
            if (replay.hold >= REPLAY_HOLD_S) {
              const today = new Date().toISOString().slice(0, 10);
              if (replay.trace.seed.date !== today) {
                void loadTerrain(); // a new UTC day means a new signed terrain
              } else {
                startReplay(replay.trace);
              }
              overlay = 0;
            }
          } else if (replay.fade > 0) {
            replay.fade = Math.max(0, replay.fade - elapsed);
            overlay = replay.fade / FADE_S;
          }
          updateHud(replay.engine, replay.tick);
        }
      } else {
        accumulator = 0;
      }

      const engine = stageRef.current === "replaying"
        ? replayRef.current?.engine ?? null
        : pilotRef.current?.eng ?? null;
      draw(engine, mutationRef.current?.id ?? "", seedStrRef.current, overlay);
    };

    animation = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
    };
  }, [finishTake, loadTerrain, startReplay, updateHud]);

  const proof: ShowcaseProof = { terrain, trace, report, tamper, receipt, receiptError, recheck, recheckError };
  const attested = Boolean(terrain?.runToken);

  return (
    <main style={{ minHeight: "100vh", background: "#090b0d", color: "#f1f3f4", fontFamily: "system-ui, sans-serif", padding: "24px 16px 48px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p style={{ color: "#ccff00", font: `700 12px ${MONO}`, letterSpacing: ".13em", margin: "0 0 8px" }}>RUNTRACE · SHOWCASE LOOP</p>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 48px)", letterSpacing: "-.04em", lineHeight: 1.02, margin: "0 0 12px" }}>
          Real gameplay, verified on loop
        </h1>
        <p style={{ color: "#b5bbc1", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 820 }}>
          An autonomous agent plays today&apos;s signed market level. Its real presses are recorded at 60 Hz, the server replays them
          and compares every claimed total, and the take then loops here as a deterministic replay — it looks like a clip, but every
          frame is the game engine replaying verified input.
        </p>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
          <section style={{ background: "#111518", border: "1px solid #283036", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", padding: "12px 16px" }}>
              <span style={{ color: "#c4cbd0", font: `12px ${MONO}` }}>{STAGE_LABEL[stage]}</span>
              <span style={{ color: "#f1f3f4", font: `12px ${MONO}` }}>
                SCORE {hud.score} · CANDLES {hud.candlesPassed} · TICK {hud.tick}
              </span>
            </div>
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, padding: "0 16px 12px", font: `12px ${MONO}` }}>
              <span style={{ color: "#8d979e" }}>
                {terrain ? `${terrain.seed.symbol} · ${terrain.seed.date} · ${terrain.candles.length} closed candles` : "no terrain yet"}
              </span>
              {terrain && (
                <span
                  style={{
                    border: `1px solid ${attested ? "#687c18" : "#75443e"}`,
                    borderRadius: 999,
                    color: attested ? "#ccff00" : "#ff9a8b",
                    padding: "2px 8px",
                  }}
                >
                  {attested ? "SERVER-SIGNED TERRAIN" : "UNATTESTED TERRAIN"}
                </span>
              )}
              {stage === "replaying" && <span style={{ color: "#79838a" }}>CYCLE {cycle}</span>}
            </div>

            <canvas
              ref={canvasRef}
              aria-label="RunTrace showcase canvas"
              style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, background: "#0b0d0f", display: "block", width: "100%" }}
            />

            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, padding: 16 }}>
              <button
                onClick={() => void loadTerrain()}
                disabled={stage === "loading"}
                style={{
                  background: stage === "loading" ? "#626a70" : "#ccff00",
                  border: "none",
                  borderRadius: 6,
                  color: "#0b0d0f",
                  cursor: stage === "loading" ? "default" : "pointer",
                  font: `700 12px ${MONO}`,
                  letterSpacing: ".06em",
                  padding: "10px 14px",
                }}
              >
                {stage === "loading" ? "LOADING…" : "RELOAD TERRAIN"}
              </button>
              <a
                href="/runproof"
                style={{
                  background: "#20272c",
                  border: "1px solid #526068",
                  borderRadius: 6,
                  color: "#f1f3f4",
                  font: `700 12px ${MONO}`,
                  letterSpacing: ".06em",
                  padding: "10px 14px",
                  textDecoration: "none",
                }}
              >
                OPEN CONSOLE ↗
              </a>
            </div>

            {error && (
              <p role="alert" style={{ color: "#ff9a8b", margin: "0 16px 16px", lineHeight: 1.5 }}>
                Could not load market data ({error}). Retry in a moment.
              </p>
            )}
            {stage === "replaying" && (
              <p style={{ color: "#79838a", font: `11px ${MONO}`, margin: "0 16px 16px", lineHeight: 1.6 }}>
                This frame is the recorded trace replayed by the engine — no video file is involved.
              </p>
            )}
          </section>

          <ShowcaseProofPanel stage={stage} proof={proof} />
        </div>
      </div>
    </main>
  );
}
