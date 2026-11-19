#!/usr/bin/env bun
/**
 * AGENT-GAMES SCENARIO SUITE — reproducible readiness gate for RunTrace.
 *
 * Rebuilt 2026-11-19 from the B3.1 negative-path matrix in
 * docs/competition/READINESS.md. The original script was created in the
 * Base44 sandbox and was never committed, so five docs referenced a path that
 * did not exist in the repo (gap G1). This file closes that gap: one command
 * now reproduces every claim, positive and negative, as machine-readable
 * evidence.
 *
 *   Run:  bun scripts/agent-games-scenarios.ts [--base-url URL] [--out PATH]
 *   Env:  AGENT_GAMES_HMAC_SECRET — required for the protocol.* scenarios;
 *         it must hold the SAME value the server process was started with,
 *         otherwise the signed endpoint correctly answers 401/503 and those
 *         scenarios are reported SKIP (suite still covers the public routes).
 *   Out:  docs/evidence/agent-games-scenarios.json (default)
 *
 * Exit code: 0 when no scenario FAILED (SKIP is allowed), 1 otherwise.
 * No LLM, no randomness, no fixture replay: the trace is produced by the real
 * deterministic engine on terrain attested by the server's own run token —
 * exactly what docs/competition/READINESS.md B3 promises.
 */
import { createHash, createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { playAgentRun, type AgentProfileId } from "../src/game/runproof/agent-run";
import { POOL } from "../src/game/cc/mutations";
import type { RunProofTrace } from "../src/game/runproof/types";

// ---------------------------------------------------------------- CLI config
const argv = process.argv.slice(2);
function argOf(name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const BASE_URL = (argOf("--base-url", process.env.BASE_URL?.trim() || "http://localhost:3000")).replace(/\/$/, "");
const OUT_PATH = argOf("--out", join("docs", "evidence", "agent-games-scenarios.json"));
const SECRET = process.env.AGENT_GAMES_HMAC_SECRET?.trim() ?? "";

// ------------------------------------------------------------------- helpers
type ScenarioStatus = "PASS" | "FAIL" | "SKIP";
interface ScenarioResult {
  id: string;
  title: string;
  status: ScenarioStatus;
  latencyMs: number;
  detail: Record<string, unknown>;
}
const results: ScenarioResult[] = [];
let rateLimitWaits = 0;
let terrain: {
  seed: { date: string; symbol: string; interval: string; source: string };
  candles: Array<Record<string, unknown>>;
  runToken?: string;
} | null = null;

class SkipSignal extends Error {}

async function http(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${BASE_URL}${path}`, init);
    if (res.status === 429 && attempt < 3) {
      attempt += 1;
      rateLimitWaits += 1;
      const wait = Math.max(1, Number(res.headers.get("Retry-After") ?? 5));
      await Bun.sleep(wait * 1000);
      continue;
    }
    return res;
  }
}

async function scenario(
  id: string,
  title: string,
  fn: () => Promise<Record<string, unknown>>,
  skipIf: () => string | null = () => null,
): Promise<void> {
  const skipReason = skipIf();
  if (skipReason) {
    results.push({ id, title, status: "SKIP", latencyMs: 0, detail: { reason: skipReason } });
    console.log(`  SKIP ${id} — ${skipReason}`);
    return;
  }
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ id, title, status: "PASS", latencyMs: Math.round(performance.now() - t0), detail });
    console.log(`  PASS ${id} (${results.at(-1)!.latencyMs}ms)`);
  } catch (error) {
    if (error instanceof SkipSignal) {
      results.push({ id, title, status: "SKIP", latencyMs: 0, detail: { reason: (error as Error).message } });
      console.log(`  SKIP ${id} — ${(error as Error).message}`);
      return;
    }
    const detail = { error: String((error as Error)?.message ?? error) };
    results.push({ id, title, status: "FAIL", latencyMs: Math.round(performance.now() - t0), detail });
    console.log(`  FAIL ${id} — ${detail.error}`);
  }
}

/** HMAC-SHA256 over the exact raw body bytes, UTF-8 key, lowercase hex — the
 * documented competitor-evidence profile of src/game/agentgames/adapter.ts. */
function sign(body: string): string {
  return createHmac("sha256", Buffer.from(SECRET, "utf8")).update(Buffer.from(body, "utf8")).digest("hex");
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function codesOf(report: { issues?: Array<{ code?: string }> }): string[] {
  return (report.issues ?? []).map((issue) => issue.code ?? "").filter(Boolean);
}

const deepClone = (trace: RunProofTrace): RunProofTrace =>
  JSON.parse(JSON.stringify(trace)) as RunProofTrace;

const sigHeader = () => "x-agent-games-signature";

// ------------------------------------------------------------------ the suite
async function main(): Promise<void> {
  console.log(`agent-games-scenarios → ${BASE_URL} (secret ${SECRET ? "configured" : "MISSING"})`);

  let attested: RunProofTrace | null = null;
  let lost: RunProofTrace | null = null;
  let receiptId = "";

  // -- 1-2 · public pages ----------------------------------------------------
  await scenario("deployment.home", "Home route serves the app", async () => {
    const res = await http("/");
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const html = await res.text();
    expect(html.length > 1000, `page too small: ${html.length} bytes`);
    return { status: res.status, bytes: html.length };
  });
  await scenario("deployment.showcase", "Public showcase serves", async () => {
    const res = await http("/runproof/showcase");
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const html = await res.text();
    expect(html.length > 1000, `page too small: ${html.length} bytes`);
    return { status: res.status, bytes: html.length };
  });

  // -- 3 · attested terrain ---------------------------------------------------
  let candlesHash = "";
  await scenario("terrain.attested", "GET /api/candles issues a signed terrain", async () => {
    const res = await http("/api/candles");
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const data = (await res.json()) as {
      seed: { date: string; symbol: string; interval: string; source: string };
      candles: Array<{ close: number; high: number } & Record<string, unknown>>;
      runToken?: string;
    };
    expect(Boolean(data.runToken), "no runToken issued — terrain is not attested");
    expect(data.candles.length > 10, `too few candles: ${data.candles.length}`);
    candlesHash = createHash("sha256").update(JSON.stringify(data.candles)).digest("hex");
    terrain = data;
    return {
      seed: data.seed,
      candles: data.candles.length,
      runTokenPrefix: (data.runToken ?? "").slice(0, 12),
      candlesHash,
    };
  });

  // -- 4 · genuine headless agent run ----------------------------------------
  let agentTrace: RunProofTrace | null = null;
  await scenario("agent.run", "Headless agent plays the attested level", async () => {
    expect(terrain, "terrain scenario did not run");
    const run = playAgentRun({
      candles: terrain.candles as never,
      seed: { date: terrain.seed.date, symbol: terrain.seed.symbol },
      runToken: terrain.runToken,
      terrainKind: `market-${terrain.seed.source}`,
      profile: "wickcop",
    });
    agentTrace = run.trace;
    return {
      ticks: run.trace.ticks,
      inputs: run.trace.inputs.length,
      score: run.trace.claims.score,
      candlesPassed: run.trace.claims.candlesPassed,
      deathCause: run.trace.claims.deathCause,
      died: run.died,
    };
  });
  expect(agentTrace, "agent.run failed — the rest of the suite needs a real trace");
  attested = agentTrace;

  // -- 5-6 · public verifier: accept + tamper ---------------------------------
  await scenario("verify.accept", "Public verifier ACCEPTs the attested trace", async () => {
    const res = await http("/api/runproof/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attested),
    });
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const report = (await res.json()) as { decision: string; policy: string };
    expect(report.decision === "ACCEPT", `decision ${report.decision}: ${JSON.stringify(report).slice(0, 300)}`);
    return { decision: report.decision, policy: report.policy };
  });
  await scenario("verify.tamper", "Bumped score is FLAGged with its code", async () => {
    const tampered = deepClone(attested!);
    tampered.claims.score += 1;
    const res = await http("/api/runproof/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tampered),
    });
    const report = (await res.json()) as { decision: string; issues: Array<{ code: string }> };
    expect(res.status === 200 && report.decision === "FLAG", `decision ${report.decision}`);
    expect(codesOf(report).includes("score_mismatch"), `codes ${JSON.stringify(codesOf(report))}`);
    return { decision: report.decision, codes: codesOf(report) };
  });

  // -- 7-9 · receipts ----------------------------------------------------------
  await scenario("receipt.issue", "Receipt issued for the attested run", async () => {
    const res = await http("/api/runproof/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attested),
    });
    const text = await res.text();
    expect(res.status === 201, `expected 201, got ${res.status}: ${text}`);
    const body = JSON.parse(text) as { id: string };
    receiptId = body.id;
    return { id: receiptId, url: `${BASE_URL}/runproof/r/${receiptId}` };
  });
  await scenario("receipt.read", "Anyone with the link can re-check the verdict", async () => {
    const res = await http("/api/runproof/runs?limit=50");
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const body = (await res.json()) as { runs: Array<{ id: string; decision: string; terrainAttested: boolean; traceHash: string }> };
    const found = body.runs.find((run) => run.id === receiptId);
    expect(found, `receipt ${receiptId} not in the public list`);
    const expectedHash = createHash("sha256").update(JSON.stringify(attested)).digest("hex");
    expect(found.traceHash === expectedHash, "stored traceHash does not match the trace");
    return { id: found.id, decision: found.decision, terrainAttested: found.terrainAttested, traceHash: found.traceHash };
  });
  await scenario("receipt.unattested", "Terrain without a server token gets no receipt", async () => {
    expect(terrain, "terrain scenario did not run");
    const unattested = playAgentRun({
      candles: terrain.candles as never,
      seed: { date: terrain.seed.date, symbol: terrain.seed.symbol },
      terrainKind: `market-${terrain.seed.source}`,
      profile: "wickcop",
    });
    const res = await http("/api/runproof/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unattested.trace),
    });
    expect(res.status === 422, `expected 422, got ${res.status}`);
    return { status: res.status };
  });

  // -- 10-14 · signed protocol --------------------------------------------------
  const taskEnvelope = (taskId: string, trace: RunProofTrace) =>
    JSON.stringify({ type: "runproof.verify.v1", taskId, trace });

  await scenario("protocol.preflight", "Signed preflight handshake", async () => {
    if (!SECRET) throw new SkipSignal("AGENT_GAMES_HMAC_SECRET is not set on this host — protocol scenarios SKIP");
    const body = JSON.stringify({ type: "agent-games.preflight.v1" });
    const res = await http("/api/agentgames", {
      method: "POST",
      headers: { "Content-Type": "application/json", [sigHeader()]: sign(body) },
      body,
    });
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const payload = (await res.json()) as { ok: boolean; protocolVersion: string };
    expect(payload.ok === true && payload.protocolVersion === "v1", `handshake ${JSON.stringify(payload)}`);
    expect(Boolean(res.headers.get(sigHeader())), "response is not signed");
    return { status: res.status, body: payload, responseSigned: true };
  });
  await scenario("protocol.task", "Signed task executes and answers signed", async () => {
    if (!SECRET) throw new SkipSignal("AGENT_GAMES_HMAC_SECRET is not set on this host — protocol scenarios SKIP");
    const body = taskEnvelope(`suite-${Date.now()}`, attested!);
    const res = await http("/api/agentgames", {
      method: "POST",
      headers: { "Content-Type": "application/json", [sigHeader()]: sign(body) },
      body,
    });
    expect(res.status === 200, `expected 200, got ${res.status}`);
    const payload = (await res.json()) as { decision: string };
    expect(payload.decision === "ACCEPT", `decision ${payload.decision}`);
    expect(Boolean(res.headers.get(sigHeader())), "response is not signed");
    return { status: res.status, decision: payload.decision, responseSigned: true };
  });
  await scenario("protocol.bad-signature", "A wrong signature executes nothing", async () => {
    if (!SECRET) throw new SkipSignal("AGENT_GAMES_HMAC_SECRET is not set on this host — protocol scenarios SKIP");
    const body = taskEnvelope(`suite-badsig-${Date.now()}`, attested!);
    const wrong = sign(body) === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64);
    const res = await http("/api/agentgames", {
      method: "POST",
      headers: { "Content-Type": "application/json", [sigHeader()]: wrong },
      body,
    });
    expect(res.status === 401, `expected 401, got ${res.status}`);
    return { status: res.status };
  });
  await scenario("protocol.idempotency", "Same task_id + same body → identical signed answer", async () => {
    if (!SECRET) throw new SkipSignal("AGENT_GAMES_HMAC_SECRET is not set on this host — protocol scenarios SKIP");
    const taskId = `suite-idem-${Date.now()}`;
    const body = taskEnvelope(taskId, attested!);
    const first = await http("/api/agentgames", {
      method: "POST", headers: { "Content-Type": "application/json", [sigHeader()]: sign(body) }, body,
    });
    const firstText = await first.text();
    const second = await http("/api/agentgames", {
      method: "POST", headers: { "Content-Type": "application/json", [sigHeader()]: sign(body) }, body,
    });
    const secondText = await second.text();
    expect(first.status === 200 && second.status === 200, `statuses ${first.status}/${second.status}`);
    const identicalBody = firstText === secondText;
    const identicalSignature =
      first.headers.get(sigHeader()) === second.headers.get(sigHeader());
    expect(identicalBody && identicalSignature, `body equal: ${identicalBody}, signature equal: ${identicalSignature}`);
    return { identicalBody, identicalSignature };
  });
  await scenario("protocol.conflict", "Same task_id + different body → 409", async () => {
    if (!SECRET) throw new SkipSignal("AGENT_GAMES_HMAC_SECRET is not set on this host — protocol scenarios SKIP");
    const taskId = `suite-conflict-${Date.now()}`;
    const first = await http("/api/agentgames", {
      method: "POST",
      headers: { "Content-Type": "application/json", [sigHeader()]: sign(taskEnvelope(taskId, attested!)) },
      body: taskEnvelope(taskId, attested!),
    });
    expect(first.status === 200, `first call expected 200, got ${first.status}`);
    const conflicting = deepClone(attested!);
    conflicting.claims.score += 1;
    const second = await http("/api/agentgames", {
      method: "POST",
      headers: { "Content-Type": "application/json", [sigHeader()]: sign(taskEnvelope(taskId, conflicting)) },
      body: taskEnvelope(taskId, conflicting),
    });
    expect(second.status === 409, `expected 409, got ${second.status}`);
    return { status: second.status };
  });

  // -- 15-20 · the negative-path matrix against the honest run -----------------
  await scenario("verify.honest-loss", "A real loss is never reported as cheating", async () => {
    expect(terrain, "terrain scenario did not run");
    const profiles: AgentProfileId[] = ["wickcop", "goldenbull", "frostliquidator"];
    let loss: RunProofTrace | null = null;
    for (const profile of profiles) {
      const run = playAgentRun({
        candles: terrain.candles as never,
        seed: { date: terrain.seed.date, symbol: terrain.seed.symbol },
        runToken: terrain.runToken,
        terrainKind: `market-${terrain.seed.source}`,
        profile,
      });
      if (run.died && run.trace.claims.deathCause) { loss = run.trace; break; }
    }
    expect(loss, "no profile produced a genuine loss on today's terrain");
    lost = loss;
    const res = await http("/api/runproof/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lost),
    });
    const report = (await res.json()) as { decision: string; replay: { score: number; deathCause: string | null } };
    expect(res.status === 200 && report.decision === "ACCEPT", `decision ${report.decision}`);
    expect(report.replay.deathCause === loss.claims.deathCause, "death cause not recorded in replay");
    return { decision: report.decision, score: report.replay.score, deathCause: report.replay.deathCause, ticks: lost.ticks };
  });
  await scenario("verify.loss-inflated", "Inflating the lost score is FLAGged", async () => {
    expect(lost, "honest-loss scenario did not produce a lost trace");
    const inflated = deepClone(lost!);
    inflated.claims.score = 500;
    const res = await http("/api/runproof/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inflated),
    });
    const report = (await res.json()) as { decision: string; issues: Array<{ code: string }> };
    expect(report.decision === "FLAG", `decision ${report.decision}`);
    expect(codesOf(report).includes("score_mismatch"), `codes ${JSON.stringify(codesOf(report))}`);
    return { decision: report.decision, codes: codesOf(report) };
  });
  await scenario("verify.after-death", "Ticks past death are FLAGged", async () => {
    expect(lost, "honest-loss scenario did not produce a lost trace");
    const extended = deepClone(lost!);
    extended.ticks = Math.min(extended.ticks + 60, 10_000);
    const res = await http("/api/runproof/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extended),
    });
    const report = (await res.json()) as { decision: string; issues: Array<{ code: string }> };
    expect(report.decision === "FLAG", `decision ${report.decision}`);
    expect(codesOf(report).includes("ticks_after_death"), `codes ${JSON.stringify(codesOf(report))}`);
    return { decision: report.decision, codes: codesOf(report) };
  });
  await scenario("verify.terrain-tamper", "Hand-edited candle is FLAGged against the token", async () => {
    expect(attested, "attested trace missing");
    const edited = deepClone(attested!);
    // Candle rows are { t, o, h, l, c, v } — nudge the close and keep h >= c so
    // the shape stays valid and the token fingerprint is what fails.
    const row = edited.terrain.candles[1] as { c: number; h: number };
    row.c = row.c * 1.01;
    row.h = Math.max(row.h, row.c) * 1.01;
    const res = await http("/api/runproof/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edited),
    });
    const report = (await res.json()) as { decision: string; issues: Array<{ code: string }> };
    expect(report.decision === "FLAG", `decision ${report.decision}`);
    expect(codesOf(report).includes("run_token_terrain_mismatch"), `codes ${JSON.stringify(codesOf(report))}`);
    return { decision: report.decision, codes: codesOf(report) };
  });
  await scenario("verify.mutation-swap", "A different daily mutation id is FLAGged", async () => {
    expect(attested, "attested trace missing");
    const swapped = deepClone(attested!);
    const claimed = swapped.mutationId;
    const other = POOL.map((mutation) => mutation.id).find((id) => id !== claimed) ?? "lowgrav";
    swapped.mutationId = other;
    const res = await http("/api/runproof/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(swapped),
    });
    const report = (await res.json()) as { decision: string; issues: Array<{ code: string }> };
    expect(report.decision === "FLAG", `decision ${report.decision}`);
    expect(codesOf(report).includes("mutation_mismatch"), `codes ${JSON.stringify(codesOf(report))}`);
    return { claimed: other, expected: claimed, codes: codesOf(report) };
  });
  await scenario("verify.foreign-token", "A token minted for another symbol is FLAGged", async () => {
    expect(attested, "attested trace missing");
    expect(terrain, "terrain scenario did not run");
    const foreign = await (await http("/api/candles?symbol=BTCUSDT")).json() as { runToken?: string };
    expect(Boolean(foreign.runToken), "no BTCUSDT runToken issued");
    const borrowed = deepClone(attested!);
    borrowed.runToken = foreign.runToken;
    const res = await http("/api/runproof/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(borrowed),
    });
    const report = (await res.json()) as { decision: string; issues: Array<{ code: string }> };
    expect(report.decision === "FLAG", `decision ${report.decision}`);
    expect(codesOf(report).includes("run_token_seed_mismatch"), `codes ${JSON.stringify(codesOf(report))}`);
    return { borrowedFrom: "BTCUSDT", decision: report.decision, codes: codesOf(report) };
  });

  // -- 21-22 · transport guards --------------------------------------------------
  await scenario("verify.oversized", "A 2.2 MB body is refused before any replay", async () => {
    const pad = "x".repeat(2_200_000);
    const res = await http("/api/runproof/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "runproof/v1", pad }),
    });
    expect(res.status === 413, `expected 413, got ${res.status}`);
    return { status: res.status };
  });
  await scenario("receipt.invalid-json", "Malformed JSON answers 400, no crash", async () => {
    const res = await http("/api/runproof/runs", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json at all",
    });
    expect(res.status === 400, `expected 400, got ${res.status}`);
    return { status: res.status };
  });

  // ------------------------------------------------------------------ report
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    skipped: results.filter((r) => r.status === "SKIP").length,
    rateLimitWaits,
  };
  const report = {
    suite: "agent-games-scenarios/v1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    protocol: {
      task: "runproof.verify.v1",
      signatureProfile: "hmac-sha256/raw-body/utf8-key/lowercase-hex (local implemented choice, not a confirmed platform contract)",
      signingKeyConfigured: Boolean(SECRET),
    },
    summary,
    facts: {
      terrain: terrain ? { seed: terrain.seed, candles: terrain.candles.length, runTokenPrefix: (terrain.runToken ?? "").slice(0, 12), candlesHash } : null,
      agentRun: agentTrace ? { profile: "wickcop", died: Boolean(agentTrace.claims.deathCause), ticks: agentTrace.ticks, inputs: agentTrace.inputs.length, claims: agentTrace.claims } : null,
    },
    scenarios: results,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(`\n${summary.passed} pass · ${summary.failed} fail · ${summary.skipped} skip (${summary.rateLimitWaits} rate-limit waits) → ${OUT_PATH}`);
  if (summary.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`suite aborted: ${error}`);
  process.exit(1);
});
