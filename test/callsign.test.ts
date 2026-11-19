/// <reference types="bun-types" />
// Generated board handles (src/lib/callsign.ts) — pins the honesty contract:
// 1. a typed name is NEVER rewritten; only nameless rows get a handle,
// 2. the handle is deterministic (same row ⇒ same handle on every read),
// 3. distinct runs of the same placeholder name get distinct handles,
// 4. the handle stays inside the board's 14-char name column.
import { describe, test, expect } from "bun:test";
import { callsignFor, displayName, isPlaceholderName } from "@/lib/callsign";

describe("callsign — generated handles for nameless board rows", () => {
  test("placeholder detection covers the ANON fallback and fixture names", () => {
    expect(isPlaceholderName("")).toBe(true);
    expect(isPlaceholderName("anon")).toBe(true);
    expect(isPlaceholderName("REPLAY")).toBe(true);
    expect(isPlaceholderName("CLIMBER01")).toBe(false);
  });

  test("a typed name is never rewritten", () => {
    expect(displayName({ name: "CLIMBER01", ts: 1, score: 140, symbol: "XRPUSDT" })).toBe("CLIMBER01");
  });

  test("nameless rows get a deterministic, column-safe handle", () => {
    const row = { name: "REPLAY", ts: 1795088984423, score: 100, symbol: "BTCUSDT" };
    const a = displayName(row);
    expect(a).toBe(displayName(row));
    expect(a).toBe(callsignFor("REPLAY|1795088984423|BTCUSDT|100"));
    expect(a.length).toBeLessThanOrEqual(14);
    expect(a).toMatch(/^[A-Z]+-[A-Z2-9]{4}$/);
  });

  test("distinct runs of the same placeholder name get distinct handles", () => {
    const names = new Set(
      [1795088984423, 1795088995722, 1795089633580].map((ts) =>
        displayName({ name: "REPLAY", ts, score: 100, symbol: "BTCUSDT" }),
      ),
    );
    expect(names.size).toBe(3);
  });
});
