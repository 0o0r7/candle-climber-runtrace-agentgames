import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { clientIp } from "../../lib/http-limiter";
import { readCappedJsonBody, RunProofRequestGuard, RUNPROOF_MAX_BODY_BYTES } from "../runproof/http-guard";
import { verifyTrace } from "../runproof/verify";
import type { RunProofReport } from "../runproof/types";

export const AGENT_GAMES_SIGNATURE_HEADER = "x-agent-games-signature";
export const AGENT_GAMES_PREFLIGHT_TYPE = "agent-games.preflight.v1";
export const AGENT_GAMES_MAX_RESPONSE_BYTES = 64_000;

/**
 * Supply an implementation only after matching the platform's exact HMAC
 * algorithm and signature encoding. Official Rules/build docs describe signing
 * raw bytes but do not name the algorithm or header encoding.
 */
export interface AgentGamesSignatureProvider {
  verifyInbound(rawRequestBody: Uint8Array, signatureHeader: string, secretBytes: Uint8Array): boolean | Promise<boolean>;
  signOutbound(rawResponseBody: Uint8Array, secretBytes: Uint8Array): string | Promise<string>;
}

/**
 * Convert the exact displayed secret string to the UTF-8 key bytes used by the
 * opt-in competitor-evidence candidate below. Do not trim, hex-decode, or
 * otherwise normalize the string. This interpretation is not officially specified.
 */
export function encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile(displayedSecret: string): Uint8Array {
  if (displayedSecret.length === 0) throw new TypeError("Displayed secret must not be empty.");
  return new TextEncoder().encode(displayedSecret);
}

/**
 * OPT-IN / TEST PROFILE ONLY — a candidate inferred from competitor
 * implementations, not an official Agent Games protocol definition.
 *
 * Candidate behavior: HMAC-SHA-256 over the exact raw body bytes; key bytes are
 * the UTF-8 encoding of the exact displayed secret string; signatures are
 * lowercase hexadecimal. `secretBytes` must therefore be produced from that
 * string with encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile.
 * Keep this explicitly injected; it is not a production default.
 */
export const COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE = {
  name: "competitor-evidence/hmac-sha256-utf8-key-lowercase-hex",
  signatures: {
    verifyInbound(rawRequestBody: Uint8Array, signatureHeader: string, secretBytes: Uint8Array): boolean {
      if (!/^[0-9a-f]{64}$/.test(signatureHeader)) return false;
      const supplied = Buffer.from(signatureHeader, "hex");
      const expected = createHmac("sha256", secretBytes).update(rawRequestBody).digest();
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    },
    signOutbound(rawResponseBody: Uint8Array, secretBytes: Uint8Array): string {
      return createHmac("sha256", secretBytes).update(rawResponseBody).digest("hex");
    },
  } satisfies AgentGamesSignatureProvider,
} as const;

export interface AgentGamesTaskAdapter {
  matches(envelope: unknown): boolean;
  getTaskId(envelope: unknown): string | null;
  handle(envelope: unknown): unknown | Promise<unknown>;
}

/**
 * Wildcard does not publish an event-specific envelope. The caller must provide
 * the actual type/ID/trace mapping once that contract is available; no field
 * names or task shape are assumed here.
 */
export interface WildcardTaskMapping {
  matchesEnvelope(envelope: unknown): boolean;
  taskId(envelope: unknown): string | null;
  traceInput(envelope: unknown): unknown;
}

export function createWildcardRunTraceAdapter(mapping: WildcardTaskMapping): AgentGamesTaskAdapter {
  return {
    matches: mapping.matchesEnvelope,
    getTaskId: mapping.taskId,
    handle(envelope) {
      const report: RunProofReport = verifyTrace(mapping.traceInput(envelope));
      return {
        task: report.task,
        policy: report.policy,
        decision: report.decision,
        reason: report.reason,
        evidence: report.evidence,
        limits: report.limits,
      };
    },
  };
}

export interface SignedAgentGamesResponse {
  status: number;
  body: Uint8Array;
  signature: string;
  retryAfterSeconds?: number;
}

type IdempotencyEntry = {
  fingerprint: string;
  touchedAt: number;
  pending: Promise<SignedAgentGamesResponse> | null;
  completed: SignedAgentGamesResponse | null;
};

type IdempotencyResult =
  | { kind: "response"; response: SignedAgentGamesResponse }
  | { kind: "conflict" }
  | { kind: "capacity" };

/** Bounded, process-local retry cache; task handlers used here must be stateless/idempotent too. */
export class AgentGamesIdempotencyCache {
  private readonly entries = new Map<string, IdempotencyEntry>();

  constructor(
    private readonly maxEntries = 512,
    private readonly retentionMs = 24 * 60 * 60 * 1_000,
  ) {}

  async run(
    taskId: string,
    fingerprint: string,
    work: () => Promise<SignedAgentGamesResponse>,
    now = Date.now(),
  ): Promise<IdempotencyResult> {
    this.prune(now);
    const existing = this.entries.get(taskId);
    if (existing) {
      existing.touchedAt = now;
      if (existing.fingerprint !== fingerprint) return { kind: "conflict" };
      if (existing.completed) return { kind: "response", response: existing.completed };
      if (existing.pending) return { kind: "response", response: await existing.pending };
    }

    if (this.entries.size >= this.maxEntries) this.evictOldestCompleted();
    if (this.entries.size >= this.maxEntries) return { kind: "capacity" };

    const pending = work();
    const entry: IdempotencyEntry = { fingerprint, touchedAt: now, pending, completed: null };
    this.entries.set(taskId, entry);
    try {
      const response = await pending;
      entry.pending = null;
      entry.completed = response;
      entry.touchedAt = Date.now();
      return { kind: "response", response };
    } catch (error) {
      this.entries.delete(taskId);
      throw error;
    }
  }

  private prune(now: number): void {
    for (const [taskId, entry] of this.entries) {
      if (!entry.pending && now - entry.touchedAt >= this.retentionMs) this.entries.delete(taskId);
    }
  }

  private evictOldestCompleted(): void {
    let oldestTaskId: string | undefined;
    let oldestTouch = Number.POSITIVE_INFINITY;
    for (const [taskId, entry] of this.entries) {
      if (!entry.pending && entry.touchedAt < oldestTouch) {
        oldestTaskId = taskId;
        oldestTouch = entry.touchedAt;
      }
    }
    if (oldestTaskId !== undefined) this.entries.delete(oldestTaskId);
  }
}

export interface AgentGamesHandlerOptions {
  /** Runtime-provided registration secret bytes; never persist or commit this value. */
  secretBytes: Uint8Array;
  signatures: AgentGamesSignatureProvider;
  taskAdapter: AgentGamesTaskAdapter;
  requestGuard?: RunProofRequestGuard;
  idempotencyCache?: AgentGamesIdempotencyCache;
  maxBodyBytes?: number;
}

function responseBytes(payload: unknown): Uint8Array {
  const json = JSON.stringify(payload);
  if (typeof json !== "string") throw new TypeError("Agent Games response must serialize to JSON.");
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > AGENT_GAMES_MAX_RESPONSE_BYTES) {
    throw new RangeError("Agent Games response exceeds the local response bound.");
  }
  return bytes;
}

export function createAgentGamesHttpHandler(options: AgentGamesHandlerOptions) {
  const guard = options.requestGuard ?? new RunProofRequestGuard();
  const idempotency = options.idempotencyCache ?? new AgentGamesIdempotencyCache();
  const maxBodyBytes = options.maxBodyBytes ?? RUNPROOF_MAX_BODY_BYTES;

  const makeSignedResponse = async (payload: unknown, status: number, retryAfterSeconds?: number): Promise<SignedAgentGamesResponse> => {
    const body = responseBytes(payload);
    const signature = await options.signatures.signOutbound(body, options.secretBytes);
    if (!signature) throw new Error("Signature provider returned an empty response signature.");
    return retryAfterSeconds === undefined
      ? { status, body, signature }
      : { status, body, signature, retryAfterSeconds };
  };

  const toResponse = (signed: SignedAgentGamesResponse): Response => {
    const body = new ArrayBuffer(signed.body.byteLength);
    new Uint8Array(body).set(signed.body);
    return new Response(body, {
    status: signed.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        [AGENT_GAMES_SIGNATURE_HEADER]: signed.signature,
        ...(signed.retryAfterSeconds === undefined ? {} : { "Retry-After": String(signed.retryAfterSeconds) }),
      },
    });
  };

  return async function handleAgentGamesRequest(request: Request): Promise<Response> {
    const admission = guard.acquire(clientIp(request));
    if (!admission.allowed) {
      const status = admission.reason === "rate_limited" ? 429 : 503;
      const message = admission.reason === "rate_limited"
        ? "Agent Games request rate limit exceeded; retry later."
        : "Agent Games adapter is at its local concurrency limit; retry shortly.";
      const retryAfterSeconds = admission.reason === "rate_limited" ? admission.retryAfterSeconds : 1;
      const signed = await makeSignedResponse({ error: message }, status, retryAfterSeconds);
      return toResponse(signed);
    }

    try {
      const bodyResult = await readCappedJsonBody(request, maxBodyBytes);
      if (!bodyResult.ok && bodyResult.reason !== "invalid_utf8") {
        const status = bodyResult.reason === "too_large" ? 413 : 400;
        const message = bodyResult.reason === "too_large"
          ? "Task request exceeds the local streamed body limit."
          : bodyResult.reason === "invalid_content_length"
            ? "Content-Length must be a non-negative integer."
            : "Task request stream could not be read.";
        return toResponse(await makeSignedResponse({ error: message }, status));
      }

      const rawBody = bodyResult.bytes;
      const signature = request.headers.get(AGENT_GAMES_SIGNATURE_HEADER);
      if (!signature) {
        return toResponse(await makeSignedResponse({ error: "Missing task signature." }, 401));
      }

      let signatureValid = false;
      try {
        signatureValid = await options.signatures.verifyInbound(rawBody, signature, options.secretBytes);
      } catch {
        return toResponse(await makeSignedResponse({ error: "Signature provider failed; request rejected." }, 503));
      }
      if (!signatureValid) {
        return toResponse(await makeSignedResponse({ error: "Invalid task signature." }, 401));
      }
      if (!bodyResult.ok) {
        return toResponse(await makeSignedResponse({ error: "Task body must be valid UTF-8 JSON." }, 400));
      }

      let envelope: unknown;
      try {
        envelope = JSON.parse(bodyResult.text);
      } catch {
        return toResponse(await makeSignedResponse({ error: "Task body must be valid JSON." }, 400));
      }

      if (isRecord(envelope) && envelope.type === AGENT_GAMES_PREFLIGHT_TYPE) {
        return toResponse(await makeSignedResponse({ ok: true, protocolVersion: "v1" }, 200));
      }
      let taskMatches: boolean;
      try {
        taskMatches = options.taskAdapter.matches(envelope);
      } catch {
        return toResponse(await makeSignedResponse({ error: "Configured task matcher failed." }, 500));
      }
      if (!taskMatches) {
        return toResponse(await makeSignedResponse({ error: "No configured task adapter matches this envelope." }, 400));
      }

      let taskId: string | null;
      try {
        taskId = options.taskAdapter.getTaskId(envelope);
      } catch {
        return toResponse(await makeSignedResponse({ error: "Configured task-ID extractor failed." }, 500));
      }
      if (typeof taskId !== "string" || taskId.trim().length === 0 || taskId.length > 256) {
        return toResponse(await makeSignedResponse({ error: "Configured task adapter did not provide a bounded task ID." }, 400));
      }
      const fingerprint = createHash("sha256").update(rawBody).digest("hex");
      const result = await idempotency.run(taskId, fingerprint, async () => {
        try {
          return await makeSignedResponse(await options.taskAdapter.handle(envelope), 200);
        } catch {
          return await makeSignedResponse({ error: "Configured task handler failed." }, 500);
        }
      });

      if (result.kind === "conflict") {
        return toResponse(await makeSignedResponse({ error: "Task ID was already used with a different request body." }, 409));
      }
      if (result.kind === "capacity") {
        return toResponse(await makeSignedResponse({ error: "Local idempotency cache is at capacity; retry shortly." }, 503));
      }
      return toResponse(result.response);
    } finally {
      guard.release();
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
