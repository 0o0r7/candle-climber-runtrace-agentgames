import { describe, expect, test } from "bun:test";
import { Engine } from "@/game/cc/engine";
import { buildPlatforms } from "@/game/cc/level";
import { BASE_MODS } from "@/game/cc/mutations";
import { QA_TERRAIN_KIND, makeQaCandles } from "@/game/runproof/qa-terrain";
import {
  checkRivalQaEngineInvariants,
  createRivalQaFinding,
  RIVAL_QA_BUILD_ID,
  runRivalBotQaSuite,
  type RivalQaSuite,
} from "@/game/runproof/rival-qa";
import { verifyTrace } from "@/game/runproof/verify";
import { RIVAL_QA_RECORDER_ID } from "@/game/runproof/types";

let generatedSuite: RivalQaSuite;

describe("RunTrace autonomous RivalBot QA", () => {
  test("runs six deterministic seed/profile cases and each captured bot run replays consistently", () => {
    const first = runRivalBotQaSuite();
    const second = runRivalBotQaSuite();
    generatedSuite = first;

    expect(first.summary).toEqual({ total: 6, passed: 6, flagged: 0, invariantIssueCount: 0 });
    expect(first.cases.every((qaCase) => qaCase.verdict === "PASS")).toBe(true);
    expect(first.cases.every((qaCase) => qaCase.trace.recorder?.id === RIVAL_QA_RECORDER_ID)).toBe(true);
    expect(first.cases.every((qaCase) => qaCase.replay.decision === "ACCEPT")).toBe(true);
    expect(first.cases.every((qaCase) => qaCase.trace.claims.score === qaCase.replay.replay?.score)).toBe(true);
    expect(first.cases.every((qaCase) => qaCase.trace.terrain.kind === QA_TERRAIN_KIND)).toBe(true);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("detects non-finite state and monotonic score violations independently of replay", () => {
    const candles = makeQaCandles(72);
    const seed = "2026-01-16QA-ALPHA";
    const engine = new Engine(buildPlatforms(candles, seed), { onDeath: () => {}, onScore: () => {} }, BASE_MODS, seed);
    const initial = checkRivalQaEngineInvariants(engine, null, 0);
    expect(initial.issues).toHaveLength(0);

    engine.score = Number.NaN;
    const nonFinite = checkRivalQaEngineInvariants(engine, initial.current, 1);
    expect(nonFinite.issues.some((issue) => issue.code === "non_finite_engine_state")).toBe(true);

    engine.score = -1;
    const scoreRegression = checkRivalQaEngineInvariants(engine, initial.current, 2);
    expect(scoreRegression.issues.some((issue) => issue.code === "score_regression")).toBe(true);
  });

  test("a flagged QA finding carries seed, profile, ruleset/build ID, and the complete trace", () => {
    const base = generatedSuite.cases[0];
    const trace = structuredClone(base.trace);
    trace.claims.score += 1;
    const replay = verifyTrace(trace);
    expect(replay.decision).toBe("FLAG");

    const finding = createRivalQaFinding({
      ...base,
      trace,
      replay,
      verdict: "FLAG",
      reason: replay.reason,
      evidence: replay.evidence,
    });
    expect(finding.verdict).toBe("FLAG");
    expect(finding.seed).toEqual(base.seed);
    expect(finding.profile).toEqual(base.profile);
    expect(finding.ruleset).toBe(base.ruleset);
    expect(finding.buildId).toBe(RIVAL_QA_BUILD_ID);
    expect(finding.trace).toEqual(trace);
    expect(finding.replay.decision).toBe("FLAG");
  });
});
