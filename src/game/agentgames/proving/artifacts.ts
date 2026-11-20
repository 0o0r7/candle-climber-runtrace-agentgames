/**
 * proving/artifacts.ts — runtime fetch + integrity verification + /tmp cache of
 * the official gatekeeper circuit artifacts.
 *
 * The artifacts are published by the platform at fixed URLs and their sha256
 * digests are pinned here (recorded from an independent download on
 * 2026-11-20; they also match the ARTIFACTS.sha256 captured 2026-11-18). A
 * digest mismatch aborts proving — the caller then answers decision-only.
 *
 * Serverless notes: /tmp is writable and persists per warm instance, so the
 * ~2.1 MB download happens once per cold start. The route module fires
 * warmProver() at import time so preflight (always delivered before tasks)
 * absorbs the cold-start cost.
 */
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadMapping, type SignalMapping } from "./mapping";

const CIRCUIT_INFO_URL = "https://agentgames.zkverify.io/api/circuit-info";
const WASM_URL = "https://agentgames.zkverify.io/circuits/gatekeeper.wasm";
const ZKEY_URL = "https://agentgames.zkverify.io/circuits/gatekeeper_final.zkey";
const CACHE_DIR = join("/tmp", "agentgames-circuits");

export interface CircuitArtifacts {
  wasmPath: string;
  zkeyPath: string;
  mapping: SignalMapping;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchVerified(url: string, expectedSha256: string, destPath: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`artifact fetch ${url} -> HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Hex(bytes);
  if (actual !== expectedSha256) {
    throw new Error(`artifact digest mismatch for ${url}: expected ${expectedSha256}, got ${actual}`);
  }
  await writeFile(destPath, bytes);
}

/** sha256 of a file already on disk (cache validation). */
async function fileSha256(path: string): Promise<string | null> {
  try {
    const bytes = await readFile(path);
    return sha256Hex(bytes);
  } catch {
    return null;
  }
}

let mappingCache: SignalMapping | null = null;

export function getMapping(): SignalMapping {
  if (mappingCache === null) mappingCache = loadMapping();
  return mappingCache;
}

/**
 * Ensure wasm + zkey are present in /tmp with the pinned digests. Safe to call
 * concurrently: every caller re-validates; a torn write fails the digest check
 * and is replaced on the next attempt.
 */
export async function ensureCircuits(): Promise<CircuitArtifacts> {
  const mapping = getMapping();
  mkdirSync(CACHE_DIR, { recursive: true });
  const wasmPath = join(CACHE_DIR, mapping.circuit.wasmFile);
  const zkeyPath = join(CACHE_DIR, mapping.circuit.zkeyFile);

  for (const [path, url, digest] of [
    [wasmPath, WASM_URL, mapping.circuit.wasmSha256],
    [zkeyPath, ZKEY_URL, mapping.circuit.zkeySha256],
  ] as const) {
    let present = false;
    try {
      if (statSync(path).size > 0 && (await fileSha256(path)) === digest) present = true;
    } catch {
      present = false;
    }
    if (!present) await fetchVerified(url, digest, path);
  }
  return { wasmPath, zkeyPath, mapping };
}
