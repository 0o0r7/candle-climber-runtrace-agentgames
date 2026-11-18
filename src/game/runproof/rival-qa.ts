import { Engine, PLAYER_H, PLAYER_W } from "../cc/engine";
import { buildPlatforms } from "../cc/level";
import { dailyMutation } from "../cc/mutations";
import { RivalBot, type RivalBotInput, type RivalBotObserver } from "../cc/rival/bot";
import { DEMO_TERRAIN_KIND, makeDemoCandles } from "./demo-data";
import { verifyTrace } from "./verify";
import {
  FIXED_DT,
  FIXED_TICK_HZ,
  MAX_TICKS,
  RECORDER_FORMAT,
  RIVAL_QA_RECORDER_ID,
  TRACE_FORMAT,
  type InputEvent,
  type RunProofIssue,
  type RunProofReport,
  type RunProofTrace,
  type ScoreEvent,
} from "./types";

export const RIVAL_QA_RULESET = "Candle Climber Engine + RivalBot planner + fixed-tick replay and local state invariants; 60 Hz" as const;
/** Descriptive local ID only; this is not a source hash or signed build attestation. */
export const RIVAL_QA_BUILD_ID = "local-uncommitted-agentgames/runproof/rival-qa-v1" as const;
export const RIVAL_QA_MAX_TICKS = 1_800;

const SEEDS = [
  { date: "2026-01-16", symbol: "QA-ALPHA" },
  { date: "2026-02-04", symbol: "QA-BETA" },
] as const;

const PROFILES = [
  { id: "wickcop", label: "PRECISE · wickcop" },
  { id: "goldenbull", label: "GREEDY · goldenbull" },
  { id: "frostliquidator", label: "PATIENT · frostliquidator" },
] as const;

export interface RivalQaProfile {
  id: string;
  label: string;
}

export interface RivalQaEngineSnapshot {
  time: number;
  px: number;
  py: number;
  vy: number;
  camX: number;
  camY: number;
  speed: number;
  score: number;
  candlesPassed: number;
  bestStreak: number;
  coyote: number;
  buffer: number;
  grounded: boolean;
  jumpHeld: boolean;
  rush: boolean;
  graduated: boolean;
  world2: boolean;
}

export interface RivalQaCase {
  seed: { date: string; symbol: string };
  profile: RivalQaProfile;
  ruleset: typeof RIVAL_QA_RULESET;
  buildId: typeof RIVAL_QA_BUILD_ID;
  ticks: number;
  verdict: "PASS" | "FLAG";
  reason: string;
  evidence: string[];
  invariantIssues: RunProofIssue[];
  trace: RunProofTrace;
  replay: RunProofReport;
}

export interface RivalQaFinding {
  verdict: "FLAG";
  seed: { date: string; symbol: string };
  profile: RivalQaProfile;
  ruleset: typeof RIVAL_QA_RULESET;
  buildId: typeof RIVAL_QA_BUILD_ID;
  reason: string;
  evidence: string[];
  invariantIssues: RunProofIssue[];
  trace: RunProofTrace;
  replay: RunProofReport;
}

export interface RivalQaSuite {
  suite: "runtrace-rival-qa/v1";
  ruleset: typeof RIVAL_QA_RULESET;
  buildId: typeof RIVAL_QA_BUILD_ID;
  fixedTickHz: typeof FIXED_TICK_HZ;
  maxTicksPerCase: typeof RIVAL_QA_MAX_TICKS;
  summary: { total: number; passed: number; flagged: number; invariantIssueCount: number };
  cases: RivalQaCase[];
  findings: RivalQaFinding[];
}

export function createRivalQaFinding(result: RivalQaCase): RivalQaFinding {
  return {
    verdict: "FLAG",
    seed: { ...result.seed },
    profile: { ...result.profile },
    ruleset: result.ruleset,
    buildId: result.buildId,
    reason: result.reason,
    evidence: [...result.evidence],
    invariantIssues: result.invariantIssues.map((issue) => ({ ...issue })),
    trace: result.trace,
    replay: result.replay,
  };
}

function snapshotEngine(engine: Engine): RivalQaEngineSnapshot {
  return {
    time: engine.time,
    px: engine.px,
    py: engine.py,
    vy: engine.vy,
    camX: engine.camX,
    camY: engine.camY,
    speed: engine.speed,
    score: engine.score,
    candlesPassed: engine.candlesPassed,
    bestStreak: engine.bestStreak,
    coyote: engine.coyote,
    buffer: engine.buffer,
    grounded: engine.grounded,
    jumpHeld: engine.jumpHeld,
    rush: engine.rush,
    graduated: engine.graduated,
    world2: engine.world2,
  };
}

/** Checks bounded game-state invariants independently of replay claim comparison. */
export function checkRivalQaEngineInvariants(
  engine: Engine,
  previous: RivalQaEngineSnapshot | null,
  tick: number,
): { current: RivalQaEngineSnapshot; issues: RunProofIssue[] } {
  const current = snapshotEngine(engine);
  const issues: RunProofIssue[] = [];
  const numericState: Array<[string, number]> = Object.entries(current)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number");
  const nonFinite = numericState.filter(([, value]) => !Number.isFinite(value)).map(([key]) => key);
  if (nonFinite.length > 0) {
    issues.push({ code: "non_finite_engine_state", message: `Tick ${tick}: non-finite engine values: ${nonFinite.join(", ")}.` });
  }

  if (engine.grounded) {
    const platform = engine.groundPlat;
    const index = platform ? engine.plats.indexOf(platform) : -1;
    if (!platform || index < 0 || (platform.state !== "solid" && platform.state !== "crumbling")) {
      issues.push({ code: "illegal_ground_platform", message: `Tick ${tick}: grounded state has no live platform in the current level.` });
    } else {
      const horizontalOverlap = engine.px + PLAYER_W > platform.x + 6 && engine.px < platform.x + platform.w - 2;
      if (!horizontalOverlap || Math.abs(engine.py + PLAYER_H - platform.y) >= 4 || engine.vy !== 0) {
        issues.push({ code: "illegal_landing_state", message: `Tick ${tick}: grounded player is not aligned with the supporting platform.` });
      }
    }
  }

  if (engine.world2 && !engine.graduated) {
    issues.push({ code: "world2_before_graduation", message: `Tick ${tick}: world 2 is active before the summit graduation state.` });
  }

  if (previous) {
    if (current.time + 1e-9 < previous.time) {
      issues.push({ code: "time_regression", message: `Tick ${tick}: engine time moved backwards.` });
    }
    if (current.score + 1e-9 < previous.score) {
      issues.push({ code: "score_regression", message: `Tick ${tick}: score decreased from ${previous.score} to ${current.score}.` });
    }
    if (current.candlesPassed < previous.candlesPassed) {
      issues.push({ code: "candle_counter_regression", message: `Tick ${tick}: candlesPassed decreased.` });
    }
    if (current.bestStreak < previous.bestStreak) {
      issues.push({ code: "best_streak_regression", message: `Tick ${tick}: bestStreak decreased.` });
    }
    if (!previous.grounded && current.grounded) {
      const platform = engine.groundPlat;
      if (!platform || !engine.plats.includes(platform)) {
        issues.push({ code: "illegal_landing_transition", message: `Tick ${tick}: airborne-to-grounded transition has no platform.` });
      }
    }
  }

  return { current, issues };
}

function checkRivalInput(engine: Engine, action: RivalBotInput, tick: number): RunProofIssue[] {
  if (action === "jump-down" && !engine.grounded && engine.coyote <= 0) {
    return [{ code: "illegal_jump_input", message: `Tick ${tick}: RivalBot pressed jump while neither grounded nor in the coyote window.` }];
  }
  if (action === "jump-up" && !engine.jumpHeld) {
    return [{ code: "illegal_jump_release", message: `Tick ${tick}: RivalBot released jump while jump was not held.` }];
  }
  if (action === "rush-down" && engine.rush) {
    return [{ code: "duplicate_rush_down", message: `Tick ${tick}: RivalBot pressed RUSH while it was already active.` }];
  }
  if (action === "rush-up" && !engine.rush) {
    return [{ code: "duplicate_rush_up", message: `Tick ${tick}: RivalBot released RUSH while it was inactive.` }];
  }
  if (action === "enter-world2" && (!engine.graduated || engine.world2)) {
    return [{ code: "illegal_world2_transition", message: `Tick ${tick}: RivalBot requested an unavailable world-2 transition.` }];
  }
  return [];
}

function runCase(seed: typeof SEEDS[number], profile: typeof PROFILES[number]): RivalQaCase {
  const seedValue = { date: seed.date, symbol: seed.symbol };
  const seedStr = seed.date + seed.symbol;
  const candles = makeDemoCandles(72);
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
      invariantIssues.push(...checkRivalInput(engine, action, tick));
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

  bot = new RivalBot(candles, seedStr, profile.id, mutation.mods, observer);
  const initialCheck = checkRivalQaEngineInvariants(bot.eng, null, -1);
  invariantIssues.push(...initialCheck.issues);
  previous = initialCheck.current;

  const expectedPlatforms = buildPlatforms(candles, seedStr);
  if (JSON.stringify(bot.eng.plats) !== JSON.stringify(expectedPlatforms)) {
    invariantIssues.push({ code: "seeded_level_mismatch", message: "RivalBot platform build differs from the selected local seed/build input." });
  }

  for (let tick = 0; tick < RIVAL_QA_MAX_TICKS; tick += 1) {
    bot.tick(FIXED_DT);
    if (bot.eng.dead) break;
  }

  const recordedInputs = inputs.filter((event) => event.tick < steps);
  const trace: RunProofTrace = {
    format: TRACE_FORMAT,
    prototype: true,
    recorder: {
      format: RECORDER_FORMAT,
      id: RIVAL_QA_RECORDER_ID,
      version: 1,
      tickHz: FIXED_TICK_HZ,
    },
    seed: seedValue,
    terrain: { kind: DEMO_TERRAIN_KIND, candles: candles.map((candle) => ({ ...candle })) },
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

  const replay = verifyTrace(trace);
  const verdict: RivalQaCase["verdict"] = replay.decision === "ACCEPT" && invariantIssues.length === 0 ? "PASS" : "FLAG";
  const evidence = [
    ...replay.evidence,
    ...invariantIssues.map((issue) => `${issue.code}: ${issue.message}`),
  ].slice(0, 8);
  const reason = verdict === "PASS"
    ? `RivalBot completed ${trace.ticks} fixed ticks; its captured run output matches the RunTrace replay and all local invariants passed.`
    : replay.decision === "FLAG"
      ? replay.reason
      : `RivalBot run triggered ${invariantIssues.length} local invariant finding(s).`;

  return {
    seed: seedValue,
    profile: { id: profile.id, label: profile.label },
    ruleset: RIVAL_QA_RULESET,
    buildId: RIVAL_QA_BUILD_ID,
    ticks: trace.ticks,
    verdict,
    reason,
    evidence,
    invariantIssues,
    trace,
    replay,
  };
}

export function runRivalBotQaSuite(): RivalQaSuite {
  const cases = SEEDS.flatMap((seed) => PROFILES.map((profile) => runCase(seed, profile)));
  const findings = cases.filter((result) => result.verdict === "FLAG").map(createRivalQaFinding);
  return {
    suite: "runtrace-rival-qa/v1",
    ruleset: RIVAL_QA_RULESET,
    buildId: RIVAL_QA_BUILD_ID,
    fixedTickHz: FIXED_TICK_HZ,
    maxTicksPerCase: RIVAL_QA_MAX_TICKS,
    summary: {
      total: cases.length,
      passed: cases.filter((result) => result.verdict === "PASS").length,
      flagged: findings.length,
      invariantIssueCount: cases.reduce((total, result) => total + result.invariantIssues.length, 0),
    },
    cases,
    findings,
  };
}
