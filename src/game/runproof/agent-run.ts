// Headless "hypothetical user" run on a real, server-attested level.
//
// The RunTrace console plays the same way in the browser: the market terrain is
// fetched from GET /api/candles (with its HMAC run token), a pilot plays the
// chart, and the fixed-tick inputs are recorded. This module performs that run
// without a browser, so an automated scenario suite can produce a genuine
// attested trace and send it through the public endpoints.
//
// The pilot is the deterministic RivalBot — no LLM, no randomness, no network.
// Same terrain + same profile ⇒ same inputs ⇒ same replay.
import { dailyMutation } from "../cc/mutations";
import { RivalBot, type RivalBotInput, type RivalBotObserver } from "../cc/rival/bot";
import { buildPlatforms } from "../cc/level";
import type { Candle } from "../cc/types";
import { checkRivalQaEngineInvariants, type RivalQaEngineSnapshot } from "./rival-qa";
import {
  FIXED_DT,
  FIXED_TICK_HZ,
  MAX_TICKS,
  RECORDER_FORMAT,
  RIVAL_QA_RECORDER_ID,
  TRACE_FORMAT,
  type InputEvent,
  type RunProofIssue,
  type RunProofTrace,
  type ScoreEvent,
} from "./types";

export type AgentProfileId = "wickcop" | "goldenbull" | "frostliquidator";

export interface AgentRunOptions {
  candles: Candle[];
  seed: { date: string; symbol: string };
  /** Server-issued HMAC from GET /api/candles; binds the terrain to this run. */
  runToken?: string;
  /** Terrain label carried in the trace, e.g. `market-binance`. */
  terrainKind: string;
  profile?: AgentProfileId;
  maxTicks?: number;
}

export interface AgentRunResult {
  trace: RunProofTrace;
  profile: AgentProfileId;
  died: boolean;
  invariantIssues: RunProofIssue[];
}

function checkAgentInput(engine: RivalBot["eng"], action: RivalBotInput, tick: number): RunProofIssue[] {
  if (action === "jump-down" && !engine.grounded && engine.coyote <= 0) {
    return [{ code: "illegal_jump_input", message: `Tick ${tick}: jump pressed while neither grounded nor in the coyote window.` }];
  }
  if (action === "jump-up" && !engine.jumpHeld) {
    return [{ code: "illegal_jump_release", message: `Tick ${tick}: jump released while jump was not held.` }];
  }
  if (action === "rush-down" && engine.rush) {
    return [{ code: "duplicate_rush_down", message: `Tick ${tick}: RUSH pressed while already active.` }];
  }
  if (action === "rush-up" && !engine.rush) {
    return [{ code: "duplicate_rush_up", message: `Tick ${tick}: RUSH released while inactive.` }];
  }
  if (action === "enter-world2" && (!engine.graduated || engine.world2)) {
    return [{ code: "illegal_world2_transition", message: `Tick ${tick}: world-2 transition requested while unavailable.` }];
  }
  return [];
}

/** Plays one full run on the supplied terrain and returns the recorded trace. */
export function playAgentRun(options: AgentRunOptions): AgentRunResult {
  const profile = options.profile ?? "wickcop";
  const maxTicks = Math.max(1, Math.min(options.maxTicks ?? 1_800, MAX_TICKS));
  const seedStr = options.seed.date + options.seed.symbol;
  const mutation = dailyMutation(seedStr);
  const inputs: InputEvent[] = [];
  const jumpTicks: number[] = [];
  const landTicks: number[] = [];
  const scoreEvents: ScoreEvent[] = [];
  const invariantIssues: RunProofIssue[] = [];
  let steps = 0;
  let lastInputTick = -1;
  let previous: RivalQaEngineSnapshot | null = null;
  let bot: RivalBot | null = null;

  const observer: RivalBotObserver = {
    onInput: (action, tick) => {
      const engine = bot?.eng;
      if (!engine) return;
      if (tick < lastInputTick) {
        invariantIssues.push({ code: "input_tick_regression", message: `Input tick moved backwards from ${lastInputTick} to ${tick}.` });
      }
      lastInputTick = tick;
      invariantIssues.push(...checkAgentInput(engine, action, tick));
      inputs.push({ tick, action });
    },
    onScore: (score, combo, candlesPassed, tick) => {
      scoreEvents.push({ tick, score, combo, candlesPassed });
    },
    onSfx: (name, tick) => {
      if (name === "jump") jumpTicks.push(tick);
      if (name === "land") landTicks.push(tick);
    },
    onStep: (engine, tick) => {
      if (tick !== steps) {
        invariantIssues.push({ code: "step_tick_mismatch", message: `Driver tick ${tick} did not match recorded step ${steps}.` });
      }
      const checked = checkRivalQaEngineInvariants(engine, previous, tick);
      invariantIssues.push(...checked.issues);
      previous = checked.current;
      steps = tick + 1;
    },
  };

  bot = new RivalBot(options.candles, seedStr, profile, mutation.mods, observer);
  const initialCheck = checkRivalQaEngineInvariants(bot.eng, null, -1);
  invariantIssues.push(...initialCheck.issues);
  previous = initialCheck.current;

  const expectedPlatforms = buildPlatforms(options.candles, seedStr);
  if (JSON.stringify(bot.eng.plats) !== JSON.stringify(expectedPlatforms)) {
    invariantIssues.push({ code: "seeded_level_mismatch", message: "Bot platform build differs from the supplied terrain and seed." });
  }

  for (let tick = 0; tick < maxTicks; tick += 1) {
    bot.tick(FIXED_DT);
    if (bot.eng.dead) break;
  }

  const recordedInputs = inputs.filter((event) => event.tick < steps);
  const trace: RunProofTrace = {
    format: TRACE_FORMAT,
    recorder: {
      format: RECORDER_FORMAT,
      id: RIVAL_QA_RECORDER_ID,
      version: 1,
      tickHz: FIXED_TICK_HZ,
    },
    seed: { date: options.seed.date, symbol: options.seed.symbol },
    terrain: { kind: options.terrainKind, candles: options.candles.map((candle) => ({ ...candle })) },
    ...(options.runToken ? { runToken: options.runToken } : {}),
    mutationId: mutation.id,
    ticks: Math.max(1, Math.min(MAX_TICKS, steps)),
    inputs: recordedInputs.map((event) => ({ ...event })),
    claims: {
      score: Math.floor(bot.eng.score),
      candlesPassed: bot.eng.candlesPassed,
      bestStreak: bot.eng.bestStreak,
      deathCause: bot.eng.dead ? bot.eng.deathCause : null,
      jumpTicks: jumpTicks.filter((tick) => tick < steps),
      landTicks: landTicks.filter((tick) => tick < steps),
      scoreEvents: scoreEvents.filter((event) => event.tick < steps).map((event) => ({ ...event })),
    },
  };

  return { trace, profile, died: bot.eng.dead, invariantIssues };
}
