import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { dailyMutation } from "@/game/cc/mutations";
import {
  AGENT_GAMES_SIGNATURE_HEADER,
  COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE,
  createAgentGamesHttpHandler,
  createWildcardRunTraceAdapter,
  encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile,
} from "@/game/agentgames/adapter";
import { DEMO_SEED, DEMO_TERRAIN_KIND, makeDemoCandles } from "@/game/runproof/demo-data";
import { RunProofRequestGuard } from "@/game/runproof/http-guard";
import { deriveClaims } from "@/game/runproof/verify";
import type { RunProofTrace } from "@/game/runproof/types";
import type { AgentGamesSignatureProvider } from "@/game/agentgames/adapter";

/** Test harness only: SHA-256/hex is NOT asserted to be the platform's protocol algorithm. */
function localTestProvider(): { secret: Uint8Array; provider: AgentGamesSignatureProvider } {
  const secret = randomBytes(32);
  const digest = (body: Uint8Array, key: Uint8Array) => createHmac("sha256", key).update(body).digest();
  return {
    secret,
    provider: {
      signOutbound: (body, key) => digest(body, key).toString("hex"),
      verifyInbound(body, signature, key) {
        if (!/^[0-9a-f]{64}$/.test(signature)) return false;
        const supplied = Buffer.from(signature, "hex");
        const expected = digest(body, key);
        return supplied.length === expected.length && timingSafeEqual(supplied, expected);
      },
    },
  };
}

function traceFixture(): RunProofTrace {
  const seed = { ...DEMO_SEED };
  const traceBase = {
    format: "runproof/v1" as const,
    prototype: true as const,
    seed,
    terrain: { kind: DEMO_TERRAIN_KIND, candles: makeDemoCandles() },
    mutationId: dailyMutation(seed.date + seed.symbol).id,
    ticks: 10,
    inputs: [],
  };
  return { ...traceBase, claims: deriveClaims(traceBase) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wildcardAdapter() {
  return createWildcardRunTraceAdapter({
    // This is a test-only mapping, not an official Wildcard envelope.
    matchesEnvelope: (envelope) => isRecord(envelope) && envelope.kind === "local-test-envelope",
    taskId: (envelope) => isRecord(envelope) && typeof envelope.localId === "string" ? envelope.localId : null,
    traceInput: (envelope) => isRecord(envelope) ? envelope.trace : null,
  });
}

async function signedRequest(
  rawBody: Uint8Array,
  secret: Uint8Array,
  provider: AgentGamesSignatureProvider,
  clientIp = "198.51.100.51",
  signatureOverride?: string,
): Promise<Request> {
  const signature = signatureOverride ?? await provider.signOutbound(rawBody, secret);
  const body = new ArrayBuffer(rawBody.byteLength);
  new Uint8Array(body).set(rawBody);
  return new Request("http://localhost/api/agentgames", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": clientIp,
      [AGENT_GAMES_SIGNATURE_HEADER]: signature,
    },
    body,
  });
}

async function readResponse(response: Response): Promise<{ body: Uint8Array; json: unknown }> {
  const body = new Uint8Array(await response.arrayBuffer());
  return { body, json: JSON.parse(new TextDecoder().decode(body)) as unknown };
}

describe("competitor-evidence signature candidate (opt-in/test only)", () => {
  test("matches the RFC 4231 HMAC-SHA-256 known vector and accepts lowercase hex only", () => {
    const provider = COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE.signatures;
    const key = encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile("Jefe");
    const body = new TextEncoder().encode("what do ya want for nothing?");
    const knownSignature = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

    expect(provider.signOutbound(body, key)).toBe(knownSignature);
    expect(provider.verifyInbound(body, knownSignature, key)).toBe(true);
    expect(provider.verifyInbound(body, knownSignature.toUpperCase(), key)).toBe(false);
    expect(provider.verifyInbound(new TextEncoder().encode("altered body"), knownSignature, key)).toBe(false);
  });

  test("verifies and signs the exact agent-games.preflight.v1 request and response bytes", async () => {
    const provider = COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE.signatures;
    const key = encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile("candidate-profile-local-test-secret");
    const requestBody = new TextEncoder().encode(
      '{"type":"agent-games.preflight.v1","agent_id":"local-test-agent","issued_at":"2026-11-17T00:00:00Z","nonce":"local-only-vector"}',
    );
    const requestSignature = "6355519fa749b3ebe7916e7a8a3945fc4b474055cb681924d21a6c8ce81bff83";
    const expectedResponseBody = '{"ok":true,"protocolVersion":"v1"}';
    const expectedResponseSignature = "594cbf89fd229dd4b667e8d61b7139024446bf520c8adbe3f82a23e04400150e";
    const requestBuffer = new ArrayBuffer(requestBody.byteLength);
    new Uint8Array(requestBuffer).set(requestBody);
    const request = new Request("http://localhost/api/agentgames", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [AGENT_GAMES_SIGNATURE_HEADER]: requestSignature,
      },
      body: requestBuffer,
    });
    const handler = createAgentGamesHttpHandler({
      secretBytes: key,
      signatures: provider,
      taskAdapter: wildcardAdapter(),
      requestGuard: new RunProofRequestGuard(),
    });

    expect(provider.signOutbound(requestBody, key)).toBe(requestSignature);
    expect(await provider.verifyInbound(requestBody, requestSignature, key)).toBe(true);

    const response = await handler(request);
    const responseBody = new Uint8Array(await response.arrayBuffer());
    const responseSignature = response.headers.get(AGENT_GAMES_SIGNATURE_HEADER) ?? "";
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(responseBody)).toBe(expectedResponseBody);
    expect(responseSignature).toBe(expectedResponseSignature);
    expect(await provider.verifyInbound(responseBody, responseSignature, key)).toBe(true);
  });
});

describe("Agent Games generic local adapter", () => {
  test("verifies raw preflight bytes and signs the exact documented response body", async () => {
    const { secret, provider } = localTestProvider();
    const handler = createAgentGamesHttpHandler({
      secretBytes: secret,
      signatures: provider,
      taskAdapter: wildcardAdapter(),
      requestGuard: new RunProofRequestGuard(),
    });
    const rawBody = new TextEncoder().encode(JSON.stringify({
      type: "agent-games.preflight.v1",
      agent_id: "local-test-agent",
      issued_at: "2026-11-14T00:00:00Z",
      nonce: "ephemeral-test-nonce",
    }));
    const response = await handler(await signedRequest(rawBody, secret, provider));
    const result = await readResponse(response);

    expect(response.status).toBe(200);
    expect(result.json).toEqual({ ok: true, protocolVersion: "v1" });
    expect(await provider.verifyInbound(result.body, response.headers.get(AGENT_GAMES_SIGNATURE_HEADER) ?? "", secret)).toBe(true);
  });

  test("rejects an invalid request signature before attempting JSON parsing", async () => {
    const { secret, provider } = localTestProvider();
    let verifyCalls = 0;
    const instrumented: AgentGamesSignatureProvider = {
      ...provider,
      verifyInbound: async (...args) => {
        verifyCalls += 1;
        return provider.verifyInbound(...args);
      },
    };
    const handler = createAgentGamesHttpHandler({ secretBytes: secret, signatures: instrumented, taskAdapter: wildcardAdapter() });
    const response = await handler(await signedRequest(new TextEncoder().encode("{"), secret, provider, "198.51.100.52", "wrong"));
    expect(response.status).toBe(401);
    expect(verifyCalls).toBe(1);
  });

  test("enforces the streamed cap and bounded per-client rate limit", async () => {
    const { secret, provider } = localTestProvider();
    const body = new TextEncoder().encode("x".repeat(128));
    const cappedHandler = createAgentGamesHttpHandler({
      secretBytes: secret,
      signatures: provider,
      taskAdapter: wildcardAdapter(),
      maxBodyBytes: 32,
    });
    const oversized = await cappedHandler(await signedRequest(body, secret, provider, "198.51.100.53"));
    const oversizedResult = await readResponse(oversized);
    expect(oversized.status).toBe(413);
    expect(oversizedResult.json).toEqual({ error: "Task request exceeds the local streamed body limit." });
    expect(await provider.verifyInbound(oversizedResult.body, oversized.headers.get(AGENT_GAMES_SIGNATURE_HEADER) ?? "", secret)).toBe(true);

    const preflight = new TextEncoder().encode(JSON.stringify({ type: "agent-games.preflight.v1" }));
    const limitedHandler = createAgentGamesHttpHandler({
      secretBytes: secret,
      signatures: provider,
      taskAdapter: wildcardAdapter(),
      requestGuard: new RunProofRequestGuard(2, 1, 60_000, 4),
    });
    const first = await limitedHandler(await signedRequest(preflight, secret, provider, "198.51.100.54"));
    const limited = await limitedHandler(await signedRequest(preflight, secret, provider, "198.51.100.54"));
    expect(first.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    const limitedResult = await readResponse(limited);
    expect(await provider.verifyInbound(limitedResult.body, limited.headers.get(AGENT_GAMES_SIGNATURE_HEADER) ?? "", secret)).toBe(true);
  });

  test("uses a configured Wildcard mapping, returns decision/reason/evidence, and deduplicates task IDs", async () => {
    const { secret, provider } = localTestProvider();
    const trace = traceFixture();
    const envelope = { kind: "local-test-envelope", localId: "task-123", trace };
    const rawBody = new TextEncoder().encode(JSON.stringify(envelope));
    let taskExecutions = 0;
    const mapped = wildcardAdapter();
    const taskAdapter = {
      ...mapped,
      async handle(input: unknown) {
        taskExecutions += 1;
        return mapped.handle(input);
      },
    };
    const handler = createAgentGamesHttpHandler({ secretBytes: secret, signatures: provider, taskAdapter });

    const first = await handler(await signedRequest(rawBody, secret, provider));
    const firstResult = await readResponse(first);
    const retry = await handler(await signedRequest(rawBody, secret, provider));
    const retryResult = await readResponse(retry);
    expect(first.status).toBe(200);
    expect(firstResult.json).toMatchObject({
      task: "verify-run-trace",
      policy: "runproof/deterministic-replay/v1",
      decision: "ACCEPT",
    });
    expect(firstResult.json).toHaveProperty("reason");
    expect(firstResult.json).toHaveProperty("evidence");
    expect(firstResult.json).not.toHaveProperty("trace");
    expect(retryResult.body).toEqual(firstResult.body);
    expect(retry.headers.get(AGENT_GAMES_SIGNATURE_HEADER)).toBe(first.headers.get(AGENT_GAMES_SIGNATURE_HEADER));
    expect(taskExecutions).toBe(1);

    const altered = structuredClone(envelope);
    altered.trace.claims.score += 1;
    const changedBody = new TextEncoder().encode(JSON.stringify(altered));
    const conflict = await handler(await signedRequest(changedBody, secret, provider));
    const conflictResult = await readResponse(conflict);
    expect(conflict.status).toBe(409);
    expect(conflictResult.json).toEqual({ error: "Task ID was already used with a different request body." });
    expect(await provider.verifyInbound(conflictResult.body, conflict.headers.get(AGENT_GAMES_SIGNATURE_HEADER) ?? "", secret)).toBe(true);
    expect(taskExecutions).toBe(1);
  });
});
