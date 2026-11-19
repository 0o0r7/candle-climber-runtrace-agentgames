import { Engine } from "../cc/engine";
import { buildPlatforms } from "../cc/level";
import { dailyMutation } from "../cc/mutations";
import type { Candle, DeathCause, RunResult } from "../cc/types";
import {
  FIXED_DT,
  FIXED_TICK_HZ,
  MAX_CANDLES,
  MAX_INPUTS,
  MAX_TICKS,
  RECORDER_FORMAT,
  RECORDER_ID,
  RIVAL_QA_RECORDER_ID,
  TRACE_FORMAT,
  type InputAction,
  type RunProofClaims,
  type RunProofIssue,
  type RunProofReport,
  type RunProofTrace,
  type ScoreEvent,
} from "./types";

const RULESET = "this branch's Candle Climber deterministic core; fixed 60 Hz" as const;
const TASK = "verify-run-trace" as const;
const POLICY = "runproof/deterministic-replay/v1" as const;
const LIMITS = [
  "The ACCEPT/FLAG decision is produced by deterministic TypeScript validation and engine replay; it is not an LLM or probabilistic model.",
  "A trace may carry a server-issued run token that binds its terrain to the market level it was served for; input origin and player identity remain unauthenticated.",
  "No zero-knowledge proof, wallet signature, leaderboard enforcement, or third-party attestation is created.",
];

/** Optional server-side terrain check. `verified` adds evidence, `invalid`
 *  adds a FLAG issue. Supplied only where node:crypto is available, so the
 *  replay core stays usable in the browser. */
export type TerrainAttestation =
  | { kind: "verified"; evidence: string }
  | { kind: "invalid"; issue: RunProofIssue };
const ALLOWED_ACTIONS = new Set<InputAction>([
  "jump-down",
  "jump-up",
  "rush-down",
  "rush-up",
  "enter-world2",
]);
const DEATH_CAUSES = new Set<DeathCause>(["fell", "crumbled", "wicked"]);

interface Simulation {
  score: number;
  candlesPassed: number;
  bestStreak: number;
  deathCause: DeathCause | null;
  jumpTicks: number[];
  landTicks: number[];
  scoreEvents: ScoreEvent[];
  actualTicks: number;
  issues: RunProofIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeInt(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateCandles(value: unknown): value is Candle[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CANDLES) return false;
  return value.every((row) => {
    if (!isRecord(row)) return false;
    const { t, o, h, l, c } = row;
    return hasOnlyKeys(row, ["t", "o", "h", "l", "c", "v"])
      && isFiniteNumber(t) && isFiniteNumber(o) && isFiniteNumber(h) && isFiniteNumber(l) && isFiniteNumber(c)
      && l <= o && l <= c && h >= o && h >= c
      && (row.v === undefined || (isFiniteNumber(row.v) && row.v >= 0));
  });
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateScoreEvents(value: unknown): value is ScoreEvent[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item)
    && hasOnlyKeys(item, ["tick", "score", "combo", "candlesPassed"])
    && isSafeInt(item.tick) && item.tick >= 0
    && isSafeInt(item.score) && item.score >= 0
    && isSafeInt(item.combo) && item.combo >= 0
    && isSafeInt(item.candlesPassed) && item.candlesPassed >= 0,
  );
}

function simulate(trace: RunProofTrace): Simulation {
  const seedStr = trace.seed.date + trace.seed.symbol;
  const mutation = dailyMutation(seedStr);
  const platforms = buildPlatforms(trace.terrain.candles, seedStr);
  const jumpTicks: number[] = [];
  const landTicks: number[] = [];
  const scoreEvents: ScoreEvent[] = [];
  const issues: RunProofIssue[] = [];
  let currentTick = 0;
  const deathState: { result: RunResult | null } = { result: null };
  let engine!: Engine;

  engine = new Engine(platforms, {
    onDeath: (result) => { deathState.result = result; },
    onScore: (score, combo) => {
      scoreEvents.push({ tick: currentTick, score, combo, candlesPassed: engine.candlesPassed });
    },
    onSfx: (name) => {
      if (name === "jump") jumpTicks.push(currentTick);
      if (name === "land") landTicks.push(currentTick);
    },
  }, mutation.mods, seedStr);

  let actionIndex = 0;
  let actualTicks = 0;
  for (currentTick = 0; currentTick < trace.ticks; currentTick += 1) {
    if (engine.dead) {
      if (actionIndex < trace.inputs.length) {
        issues.push({ code: "action_after_death", message: `Input at tick ${trace.inputs[actionIndex].tick} occurs after the simulated run ended.` });
      }
      issues.push({ code: "ticks_after_death", message: `Trace continues after death at tick ${currentTick - 1}.` });
      break;
    }

    while (actionIndex < trace.inputs.length && trace.inputs[actionIndex].tick === currentTick) {
      const action = trace.inputs[actionIndex].action;
      if (action === "jump-down") engine.press();
      else if (action === "jump-up") engine.release();
      else if (action === "rush-down") engine.pressRush();
      else if (action === "rush-up") engine.releaseRush();
      else if (action === "enter-world2") {
        if (!engine.graduated) {
          issues.push({ code: "impossible_world2", message: `World 2 was requested at tick ${currentTick} before the summit was reached.` });
        } else {
          engine.enterWorld2();
        }
      }
      actionIndex += 1;
    }

    engine.step(FIXED_DT);
    actualTicks += 1;
  }

  if (actionIndex < trace.inputs.length) {
    issues.push({ code: "unconsumed_input", message: "One or more input events were not replayed." });
  }

  const final = deathState.result;
  return {
    score: final?.score ?? Math.floor(engine.score),
    candlesPassed: final?.candlesPassed ?? engine.candlesPassed,
    bestStreak: final?.bestStreak ?? engine.bestStreak,
    deathCause: final?.cause ?? null,
    jumpTicks,
    landTicks,
    scoreEvents,
    actualTicks,
    issues,
  };
}

/** Derive the replay assertions for a trace base; useful for tests and capture code. */
export function deriveClaims(traceBase: Omit<RunProofTrace, "claims">): RunProofClaims {
  const simulation = simulate({
    ...traceBase,
    claims: {
      score: 0,
      candlesPassed: 0,
      bestStreak: 0,
      deathCause: null,
      jumpTicks: [],
      landTicks: [],
      scoreEvents: [],
    },
  });
  return {
    score: simulation.score,
    candlesPassed: simulation.candlesPassed,
    bestStreak: simulation.bestStreak,
    deathCause: simulation.deathCause,
    jumpTicks: simulation.jumpTicks,
    landTicks: simulation.landTicks,
    scoreEvents: simulation.scoreEvents,
  };
}

function validateTrace(raw: unknown): { trace?: RunProofTrace; issues: RunProofIssue[] } {
  const issues: RunProofIssue[] = [];
  if (!isRecord(raw)) {
    return { issues: [{ code: "invalid_shape", message: "Trace must be a JSON object." }] };
  }

  if (!hasOnlyKeys(raw, ["format", "recorder", "seed", "terrain", "runToken", "mutationId", "ticks", "inputs", "claims"])) {
    issues.push({ code: "invalid_shape", message: "Trace contains properties not defined by the runproof/v1 schema." });
  }

  if (raw.format !== TRACE_FORMAT) {
    issues.push({ code: "format_mismatch", message: `Expected ${TRACE_FORMAT}.` });
  }
  if (raw.runToken !== undefined && (typeof raw.runToken !== "string" || raw.runToken.length < 1 || raw.runToken.length > 4096)) {
    issues.push({ code: "invalid_run_token", message: "runToken must be a bounded string when present." });
  }
  if (!isRecord(raw.seed) || !hasOnlyKeys(raw.seed, ["date", "symbol"]) || !isDateString(raw.seed.date)
      || typeof raw.seed.symbol !== "string" || !/^[A-Za-z0-9._-]{1,24}$/.test(raw.seed.symbol)) {
    issues.push({ code: "invalid_seed", message: "Seed must contain a real YYYY-MM-DD date and a short symbol identifier." });
  }
  if (!isRecord(raw.terrain) || !hasOnlyKeys(raw.terrain, ["kind", "candles"])
      || typeof raw.terrain.kind !== "string" || raw.terrain.kind.length < 1 || !validateCandles(raw.terrain.candles)) {
    issues.push({ code: "invalid_terrain", message: `Terrain must include 1–${MAX_CANDLES} valid OHLC candle records.` });
  }
  if (typeof raw.mutationId !== "string" || raw.mutationId.length < 1) {
    issues.push({ code: "invalid_mutation", message: "mutationId must be a non-empty string." });
  }
  if (!isSafeInt(raw.ticks) || raw.ticks < 1 || raw.ticks > MAX_TICKS) {
    issues.push({ code: "invalid_ticks", message: `ticks must be an integer from 1 to ${MAX_TICKS}.` });
  }

  if (raw.recorder !== undefined && (!isRecord(raw.recorder)
      || raw.recorder.format !== RECORDER_FORMAT
      || (raw.recorder.id !== RECORDER_ID && raw.recorder.id !== RIVAL_QA_RECORDER_ID)
      || raw.recorder.version !== 1
      || raw.recorder.tickHz !== FIXED_TICK_HZ
      || !hasOnlyKeys(raw.recorder, ["format", "id", "version", "tickHz"]))) {
    issues.push({ code: "invalid_recorder", message: "Recorder metadata must use a supported cc-fixed-tick-input/v1 ID, version 1, at 60 Hz." });
  }

  if (!Array.isArray(raw.inputs) || raw.inputs.length > MAX_INPUTS) {
    issues.push({ code: "invalid_inputs", message: `inputs must be an array with at most ${MAX_INPUTS} events.` });
  } else {
    let previousTick = -1;
    raw.inputs.forEach((item, index) => {
      if (!isRecord(item) || !hasOnlyKeys(item, ["tick", "action"])
          || !isSafeInt(item.tick) || item.tick < 0 || !isSafeInt(raw.ticks) || item.tick >= raw.ticks
          || typeof item.action !== "string" || !ALLOWED_ACTIONS.has(item.action as InputAction)) {
        issues.push({ code: "invalid_input_event", message: `Input event ${index} has an invalid tick or action.` });
        return;
      }
      if (item.tick < previousTick) issues.push({ code: "input_order", message: "Input events must be in non-decreasing tick order." });
      previousTick = item.tick;
    });
  }

  const validCause = isRecord(raw.claims)
    && (raw.claims.deathCause === null || (typeof raw.claims.deathCause === "string" && DEATH_CAUSES.has(raw.claims.deathCause as DeathCause)));
  if (!isRecord(raw.claims) || !hasOnlyKeys(raw.claims, ["score", "candlesPassed", "bestStreak", "deathCause", "jumpTicks", "landTicks", "scoreEvents"])
      || !isSafeInt(raw.claims.score) || raw.claims.score < 0
      || !isSafeInt(raw.claims.candlesPassed) || raw.claims.candlesPassed < 0
      || !isSafeInt(raw.claims.bestStreak) || raw.claims.bestStreak < 0
      || !validCause
      || !Array.isArray(raw.claims.jumpTicks) || !raw.claims.jumpTicks.every((n) => isSafeInt(n) && n >= 0)
      || !Array.isArray(raw.claims.landTicks) || !raw.claims.landTicks.every((n) => isSafeInt(n) && n >= 0)
      || !validateScoreEvents(raw.claims.scoreEvents)) {
    issues.push({ code: "invalid_claims", message: "claims must contain non-negative run totals and well-formed jump, landing, and score event arrays." });
  }

  if (issues.length > 0) return { issues };
  return { trace: raw as unknown as RunProofTrace, issues };
}

function shortText(value: string, maxLength = 220): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function issueEvidence(issue: RunProofIssue): string {
  return `${issue.code}: ${shortText(issue.message)}`;
}

export function verifyTrace(
  raw: unknown,
  attestation?: (trace: RunProofTrace) => TerrainAttestation | null,
): RunProofReport {
  const shape = validateTrace(raw);
  if (!shape.trace) {
    const firstIssue = shape.issues[0];
    return {
      task: TASK,
      policy: POLICY,
      decision: "FLAG",
      reason: shortText(firstIssue?.message ?? "Trace failed validation."),
      evidence: shape.issues.slice(0, 4).map(issueEvidence),
      ruleset: RULESET,
      replay: null,
      issues: shape.issues,
      limits: LIMITS,
    };
  }

  const trace = shape.trace;
  const expectedMutation = dailyMutation(trace.seed.date + trace.seed.symbol).id;
  if (trace.mutationId !== expectedMutation) {
    shape.issues.push({ code: "mutation_mismatch", message: `Trace claims mutation ${trace.mutationId}; this seed selects ${expectedMutation}.` });
  }

  let attest: TerrainAttestation | null = null;
  if (attestation) {
    try {
      attest = attestation(trace);
    } catch {
      attest = { kind: "invalid", issue: { code: "attestation_failed", message: "Terrain attestation could not be evaluated." } };
    }
    if (attest?.kind === "invalid") shape.issues.push(attest.issue);
  }

  const actual = simulate(trace);
  shape.issues.push(...actual.issues);
  if (actual.score !== trace.claims.score) {
    shape.issues.push({ code: "score_mismatch", message: `Claimed score ${trace.claims.score} does not match replayed score ${actual.score}.` });
  }
  if (actual.candlesPassed !== trace.claims.candlesPassed
      || actual.bestStreak !== trace.claims.bestStreak
      || actual.deathCause !== trace.claims.deathCause) {
    shape.issues.push({ code: "run_result_mismatch", message: "Claimed candles passed, best streak, or death cause does not match replay." });
  }
  if (!sameJson(actual.jumpTicks, trace.claims.jumpTicks)) {
    shape.issues.push({ code: "impossible_jump", message: "Claimed jump-start ticks do not match jumps the physics engine can produce from the input log." });
  }
  if (!sameJson(actual.landTicks, trace.claims.landTicks)) {
    shape.issues.push({ code: "impossible_landing", message: "Claimed landing ticks do not match deterministic collision results." });
  }
  if (!sameJson(actual.scoreEvents, trace.claims.scoreEvents)) {
    shape.issues.push({ code: "score_event_mismatch", message: "Per-candle score event log does not match the replay." });
  }

  const replay = {
    ticks: actual.actualTicks,
    score: actual.score,
    candlesPassed: actual.candlesPassed,
    bestStreak: actual.bestStreak,
    deathCause: actual.deathCause,
    jumpTicks: actual.jumpTicks,
    landTicks: actual.landTicks,
    scoreEvents: actual.scoreEvents,
  };
  const accepted = shape.issues.length === 0;
  const attestEvidence = attest?.kind === "verified"
    ? attest.evidence
    : "No run token attached: terrain provenance is unauthenticated.";
  const evidence = accepted
    ? [
      `Replay completed: ${actual.actualTicks} fixed ticks at ${FIXED_TICK_HZ} Hz.`,
      `Claims match replay: score ${actual.score}, ${actual.candlesPassed} candles passed, best streak ${actual.bestStreak}.`,
      `Checked ${trace.inputs.length} input events against ${trace.terrain.candles.length} supplied terrain candles.`,
      attestEvidence,
    ]
    : [
      `Replay completed: ${actual.actualTicks} fixed ticks at ${FIXED_TICK_HZ} Hz; claimed score ${trace.claims.score}, replayed score ${actual.score}.`,
      ...shape.issues.slice(0, 3).map(issueEvidence),
    ];
  return {
    task: TASK,
    policy: POLICY,
    decision: accepted ? "ACCEPT" : "FLAG",
    reason: accepted
      ? "Trace claims match deterministic replay under this local policy."
      : shortText(`Policy flagged the trace: ${shape.issues[0]?.message ?? "replay mismatch"}`),
    evidence,
    ruleset: RULESET,
    replay,
    issues: shape.issues,
    limits: LIMITS,
  };
}
