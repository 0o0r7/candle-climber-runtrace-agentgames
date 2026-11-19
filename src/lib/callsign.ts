// Generated handles for board rows that carry no typed name.
//
// LAW 1.2 keeps the guest lane honest: it shows TYPED names, unverified. A row
// that never carried a real name — the server's "ANON" fallback, an empty
// name, or a test fixture name like "REPLAY" — would otherwise repeat the same
// generic word down the board. Instead of inventing a player identity, the
// board derives a DETERMINISTIC handle from the row's own stored fields:
// obviously generated (themed prefix + hash tail), stable across every read,
// and never applied to a name a player actually typed.

const PREFIXES = [
  "WICK",
  "CLIMBER",
  "CANDLE",
  "SUMMIT",
  "PIVOT",
  "VOLUME",
  "STORM",
  "LEDGER",
] as const;

/** Names that carry no identity: the server fallback + test fixture names. */
const PLACEHOLDER = new Set(["", "ANON", "REPLAY", "TEST", "PLAYER", "GUEST"]);

export function isPlaceholderName(name: string | null | undefined): boolean {
  return PLACEHOLDER.has(String(name ?? "").trim().toUpperCase());
}

/** FNV-1a 32-bit — tiny, dependency-free, stable across runtimes. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// no I/O/0/1 — generated handles must stay unambiguous when read aloud
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tail(n: number): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[n % ALPHABET.length];
    n = Math.floor(n / ALPHABET.length);
  }
  return out;
}

/** Stable generated handle for one row (same row ⇒ same handle forever). */
export function callsignFor(seed: string): string {
  const h = hash(seed);
  return `${PREFIXES[h % PREFIXES.length]}-${tail(h >>> 8)}`;
}

export interface Nameable {
  name: string;
  ts?: number;
  score?: number;
  symbol?: string;
}

/**
 * What the board displays: the typed name untouched, or — only when the row
 * carries no name at all — a generated handle seeded by that row's own
 * timestamp/symbol/score so distinct runs never collide.
 */
export function displayName(e: Nameable): string {
  if (!isPlaceholderName(e.name)) return e.name;
  return callsignFor(`${e.name}|${e.ts ?? 0}|${e.symbol ?? ""}|${e.score ?? 0}`);
}
