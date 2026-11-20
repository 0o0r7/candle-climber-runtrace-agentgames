/**
 * proving/prover.ts — Groth16 proving for the official gatekeeper artifacts,
 * executed in a short-lived **node** child process per decision.
 *
 * Why a child process instead of in-process snarkjs:
 *  - snarkjs/ffjavascript keep a worker-thread pool alive per curve instance;
 *    under bun the pool deadlocks (observed 2026-11-20: fullProve hangs >60s),
 *    and on a long-lived server threads accumulate per task. A child that exits
 *    after each decision releases everything.
 *  - a crash or hang inside the WASM stack cannot take the HTTP server down;
 *    the wall-clock budget kills the child and the task answers decision-only.
 *  - the child runs under process.execPath (Node both in CI and on Vercel's
 *    Node runtime), with snarkjs resolved from the parent's node_modules —
 *    `serverExternalPackages` keeps it out of the bundler.
 *
 * The child script itself is embedded as a template string and written to the
 * request temp dir, so no bundler has to ship it. The parent builds the
 * witness input (mapping.ts) and passes artifact paths; the child runs
 * fullProve + a local groth16.verify self-check and writes ONE JSON line.
 *
 * Failure posture: every failure mode (artifact fetch, mapping, witness assert,
 * prove error, local verify false, budget exceeded) resolves to a non-ok
 * ProveResult and the response simply carries no proof — which scores exactly
 * the same as the previous decision-only behavior (-2 on provable tasks),
 * never worse.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createRequire } from "node:module";
import { buildWitnessInput, randomSalt, type ProvingTaskInput } from "./mapping";
import { ensureCircuits, getMapping } from "./artifacts";

export interface ProveOk {
  status: "ok";
  proof: Groth16ProofShape;
  publicSignals: string[];
  locallyVerified: boolean;
  proveMs: number;
  verifyMs: number;
}

export type ProveResult =
  | ProveOk
  /** the circuit rejected our inputs/decision — treat as disagreement, omit proof */
  | { status: "witness_assert"; detail: string }
  | { status: "timeout"; detail: string }
  | { status: "error"; detail: string };

export interface Groth16ProofShape {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

interface CliResult {
  status: "ok" | "witness_assert" | "error";
  proof?: Groth16ProofShape;
  publicSignals?: string[];
  locallyVerified?: boolean;
  proveMs?: number;
  verifyMs?: number;
  detail?: string;
}

/**
 * The child executor. Runs under plain node ESM: loads snarkjs from the path
 * the parent resolved, proves the supplied witness input (the circuit derives
 * the decision itself and asserts agreement), self-verifies against the vk
 * exported from the official zkey, and writes one JSON result line.
 */
const PROVE_CLI_SOURCE = String.raw`
import { readFileSync, writeFileSync } from "node:fs";
const [reqPath] = process.argv.slice(2);
const req = JSON.parse(readFileSync(reqPath, "utf8"));
const resultPath = req.outPath;
let result;
try {
  const mod = await import(req.snarkjsPath);
  const snarkjs = mod.default && mod.default.groth16 ? mod.default : mod;
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(req.input, req.wasmPath, req.zkeyPath);
  const proveMs = Date.now() - t0;
  const t1 = Date.now();
  const vk = await snarkjs.zKey.exportVerificationKey(req.zkeyPath);
  const locallyVerified = await snarkjs.groth16.verify(vk, publicSignals, proof);
  const verifyMs = Date.now() - t1;
  result = { status: "ok", proof, publicSignals, locallyVerified, proveMs, verifyMs };
} catch (err) {
  const msg = (err && err.message) || String(err);
  result = msg.includes("Assert Failed")
    ? { status: "witness_assert", detail: msg.slice(0, 300) }
    : { status: "error", detail: msg.slice(0, 300) };
}
try {
  writeFileSync(resultPath, JSON.stringify(result));
  process.stdout.write(JSON.stringify(result));
} finally {
  process.exit(0);
}
`;

let warmPromise: Promise<void> | null = null;

/** Fire-and-forget warm-up: fetch artifacts once per process so the first task does not pay the download. */
export function warmProver(): void {
  if (warmPromise === null) {
    const p: Promise<void> = ensureCircuits().then(() => undefined);
    p.catch(() => {
      warmPromise = null;
    });
    warmPromise = p;
  }
  void warmPromise;
}

/**
 * Node binary for the proving child. Under the bun runtime process.execPath is
 * bun itself, whose worker-thread pool deadlocks inside snarkjs — the child
 * must run under real node (PATH). Under Node (CI, Vercel serverless)
 * process.execPath IS node and is used directly.
 */
function nodeBin(): string {
  if (process.env.PROVE_NODE_BIN) return process.env.PROVE_NODE_BIN;
  return process.execPath.includes("bun") ? "node" : process.execPath;
}

function resolveSnarkjsEntry(): string {
  try {
    const require_ = createRequire(import.meta.url);
    return require_.resolve("snarkjs");
  } catch {
    return "snarkjs";
  }
}

/**
 * Prove the decision with an overall wall-clock budget. Resolves (never
 * throws); non-ok results instruct the caller to answer decision-only.
 */
export async function proveGatekeeperDecision(
  task: ProvingTaskInput,
  decision: "APPROVE" | "REJECT",
  budgetMs: number,
): Promise<ProveResult> {
  const dir = mkdtempSync(join(tmpdir(), "gk-prove-"));
  const reqPath = join(dir, "request.json");
  const outPath = join(dir, "result.json");
  try {
    const { wasmPath, zkeyPath } = await ensureCircuits();
    const input = buildWitnessInput(getMapping(), { task, decision });
    const request = { input, wasmPath, zkeyPath, outPath, snarkjsPath: resolveSnarkjsEntry() };
    writeFileSync(reqPath, JSON.stringify(request));

    const cliPath = join(dir, "prove-cli.mjs");
    writeFileSync(cliPath, PROVE_CLI_SOURCE);

    const child = spawn(nodeBin(), [cliPath, reqPath], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    let settled = false;
    let killedByTimer = false;
    const timer = setTimeout(() => {
      if (!settled) {
        killedByTimer = true;
        child.kill("SIGKILL");
      }
    }, budgetMs);

    const exitCode: number = await new Promise((resolve) => {
      child.on("exit", (code) => {
        settled = true;
        clearTimeout(timer);
        resolve(code ?? -1);
      });
      child.on("error", () => {
        settled = true;
        clearTimeout(timer);
        resolve(-1);
      });
    });

    const parse = (raw: string): CliResult | null => {
      try {
        const lines = raw.trim().split("\n").filter((l) => l !== "");
        if (lines.length === 0) return null;
        return JSON.parse(lines[lines.length - 1]) as CliResult;
      } catch {
        return null;
      }
    };

    const result = existsSync(outPath) ? parse(readFileSync(outPath, "utf8")) : parse(stdout);
    if (result === null) {
      return {
        status: killedByTimer ? "timeout" : "error",
        detail: `prove child produced no result (exit ${exitCode}, budget ${budgetMs}ms)${stderr ? ` stderr: ${stderr.slice(0, 200)}` : ""}`,
      };
    }
    if (result.status !== "ok" || !result.proof) {
      return {
        status: result.status === "witness_assert" ? "witness_assert" : "error",
        detail: result.detail ?? "unknown child failure",
      };
    }
    return {
      status: "ok",
      proof: result.proof,
      publicSignals: result.publicSignals ?? [],
      locallyVerified: result.locallyVerified === true,
      proveMs: result.proveMs ?? -1,
      verifyMs: result.verifyMs ?? -1,
    };
  } catch (err) {
    return { status: "error", detail: (err as Error).message ?? String(err) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Response budget: leave headroom under the task deadline (competition 60s, practice tighter). */
export function proveBudgetMs(deadlineAt: string | null | undefined): number {
  const MAX_BUDGET = 9_000;
  const MIN_BUDGET = 3_000;
  const SAFETY = 2_500;
  if (typeof deadlineAt !== "string" || deadlineAt.length === 0) return MIN_BUDGET;
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline)) return MIN_BUDGET;
  const available = deadline - Date.now() - SAFETY;
  return Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, available));
}

// randomSalt is re-exported for tests that want reproducible witnesses.
export { randomSalt };
