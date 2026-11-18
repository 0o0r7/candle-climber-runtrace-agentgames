export const RUNPROOF_MAX_BODY_BYTES = 2_000_000;
export const RUNPROOF_MAX_CONCURRENT = 2;
export const RUNPROOF_RATE_LIMIT = 12;
export const RUNPROOF_RATE_WINDOW_MS = 60_000;
export const RUNPROOF_MAX_RATE_BUCKETS = 2_048;

export type BodyReadResult =
  | { ok: true; bytes: Uint8Array; text: string }
  | { ok: false; reason: "too_large" | "invalid_content_length" | "read_error" }
  | { ok: false; reason: "invalid_utf8"; bytes: Uint8Array };

/**
 * Rejects a declared oversized body early, then enforces the same limit while
 * consuming the request stream so absent or dishonest Content-Length is safe.
 * On invalid UTF-8 the raw bytes are preserved so a signed protocol adapter can
 * authenticate the request before returning a parse error.
 */
export async function readCappedJsonBody(
  request: Request,
  maxBytes = RUNPROOF_MAX_BODY_BYTES,
): Promise<BodyReadResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return { ok: false, reason: "invalid_content_length" };
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes)) return { ok: false, reason: "too_large" };
    if (declaredBytes > maxBytes) return { ok: false, reason: "too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, bytes: new Uint8Array(), text: "" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_error" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, bytes, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_utf8", bytes };
  }
}

type RateBucket = { timestamps: number[]; lastSeen: number };

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { allowed: false; reason: "busy" };

/** In-memory, per-process guard; do not treat it as a distributed rate limiter. */
export class RunProofRequestGuard {
  private inFlight = 0;
  private readonly buckets = new Map<string, RateBucket>();

  constructor(
    private readonly maxConcurrent = RUNPROOF_MAX_CONCURRENT,
    private readonly rateLimit = RUNPROOF_RATE_LIMIT,
    private readonly rateWindowMs = RUNPROOF_RATE_WINDOW_MS,
    private readonly maxBuckets = RUNPROOF_MAX_RATE_BUCKETS,
  ) {}

  acquire(clientKey: string, now = Date.now()): GuardResult {
    const key = clientKey.slice(0, 128) || "unknown-client";
    this.prune(now);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) this.evictOldest();
      bucket = { timestamps: [], lastSeen: now };
      this.buckets.set(key, bucket);
    }

    if (now < bucket.lastSeen) bucket.timestamps = [];
    bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > now - this.rateWindowMs && timestamp <= now);
    bucket.lastSeen = now;

    if (bucket.timestamps.length >= this.rateLimit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.timestamps[0] + this.rateWindowMs - now) / 1_000));
      return { allowed: false, reason: "rate_limited", retryAfterSeconds };
    }
    bucket.timestamps.push(now);

    if (this.inFlight >= this.maxConcurrent) return { allowed: false, reason: "busy" };
    this.inFlight += 1;
    return { allowed: true };
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastSeen >= this.rateWindowMs) this.buckets.delete(key);
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastSeen < oldestTime) {
        oldestKey = key;
        oldestTime = bucket.lastSeen;
      }
    }
    if (oldestKey !== undefined) this.buckets.delete(oldestKey);
  }
}
