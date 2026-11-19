// RunTrace receipt storage.
// - MemoryStore: default, zero-config. Resets on restart — fine for dev/preview.
// - MongoStore: auto-activated when DATABASE_URL is a mongodb:// or
//   mongodb+srv:// URI, same pattern as the leaderboard store. Any connection
//   failure falls back to memory and is reported to telemetry.
//
// A receipt holds the verdict plus the trace that produced it, so anyone with
// the link can re-run the check. That makes documents large (up to the 2 MB
// trace cap), so both stores are explicitly bounded: memory keeps the newest
// few, Mongo expires receipts after 180 days.
import { captureError } from "@/lib/telemetry";
import type { RunReceipt, RunReceiptSummary } from "@/game/runproof/types";

const MONGO_DB = "candleclimber";
const MONGO_COLL = "runtrace_receipts";
const MEMORY_MAX = 50;
const MONGO_TTL_SECONDS = 180 * 86_400;

export interface RunproofStore {
  readonly kind: "memory" | "mongo";
  /** false when the backing store is unavailable — the route answers 503. */
  save(receipt: RunReceipt): Promise<boolean>;
  get(id: string): Promise<RunReceipt | null>;
  recent(limit: number): Promise<RunReceiptSummary[]>;
}

export function toReceiptSummary(receipt: RunReceipt): RunReceiptSummary {
  return {
    id: receipt.id,
    createdAt: receipt.createdAt,
    decision: receipt.decision,
    seed: receipt.seed,
    terrainKind: receipt.terrainKind,
    terrainAttested: receipt.terrainAttested,
    ticks: receipt.ticks,
    inputCount: receipt.inputCount,
    traceHash: receipt.traceHash,
    claims: receipt.claims,
  };
}

/* ---------------------------------- memory --------------------------------- */

export class MemoryRunproofStore implements RunproofStore {
  readonly kind = "memory" as const;
  private rows = new Map<string, RunReceipt>();

  async save(receipt: RunReceipt): Promise<boolean> {
    this.rows.set(receipt.id, receipt);
    while (this.rows.size > MEMORY_MAX) {
      const oldest = this.rows.keys().next().value;
      if (oldest === undefined) break;
      this.rows.delete(oldest);
    }
    return true;
  }

  async get(id: string): Promise<RunReceipt | null> {
    return this.rows.get(id) ?? null;
  }

  async recent(limit: number): Promise<RunReceiptSummary[]> {
    return [...this.rows.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(toReceiptSummary);
  }
}

/* ---------------------------------- mongo ---------------------------------- */

class MongoRunproofStore implements RunproofStore {
  readonly kind = "mongo" as const;
  private coll: import("mongodb").Collection<RunReceipt> | null = null;
  private connecting: Promise<import("mongodb").Collection<RunReceipt> | null> | null = null;
  private disabled = false;

  private async connect() {
    if (this.coll) return this.coll;
    if (this.disabled) return null;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const { MongoClient } = await import("mongodb");
        const client = new MongoClient(process.env.DATABASE_URL as string, {
          serverSelectionTimeoutMS: 4000,
        });
        await client.connect();
        const coll = client.db(MONGO_DB).collection<RunReceipt>(MONGO_COLL);
        await coll.createIndex({ createdAt: -1 });
        try {
          await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: MONGO_TTL_SECONDS });
        } catch (idxErr) {
          console.error("[runtrace] receipt TTL index not created:", (idxErr as Error).message);
        }
        this.coll = coll;
        return coll;
      } catch (err) {
        console.error("[runtrace] mongo unavailable, falling back to memory:", (err as Error).message);
        captureError(err, { lane: "runtrace", op: "mongo-connect", store: this.kind });
        this.disabled = true;
        return null;
      }
    })();
    return this.connecting;
  }

  async save(receipt: RunReceipt): Promise<boolean> {
    const coll = await this.connect();
    if (!coll) return false;
    try {
      await coll.insertOne(receipt);
      return true;
    } catch (err) {
      console.error("[runtrace] receipt insert failed:", (err as Error).message);
      captureError(err, { lane: "runtrace", op: "insert", store: this.kind });
      return false;
    }
  }

  async get(id: string): Promise<RunReceipt | null> {
    const coll = await this.connect();
    if (!coll) return null;
    return coll.findOne({ id });
  }

  async recent(limit: number): Promise<RunReceiptSummary[]> {
    const coll = await this.connect();
    if (!coll) return [];
    const rows = await coll
      .find({}, { projection: { trace: 0, report: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => toReceiptSummary(row));
  }
}

/* --------------------------------- singleton -------------------------------- */

let memoryStore: MemoryRunproofStore | null = null;
let mongoStore: MongoRunproofStore | null = null;

export function getRunproofStore(): RunproofStore {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("mongodb://") || url.startsWith("mongodb+srv://")) {
    if (!mongoStore) mongoStore = new MongoRunproofStore();
    return mongoStore;
  }
  if (!memoryStore) memoryStore = new MemoryRunproofStore();
  return memoryStore;
}
