/// <reference types="bun-types" />
// Clip spec pins: the caption timeline is expressed in simulation ticks, so a
// constant-frame-rate render of N ticks is exactly N frames. These tests hold the
// rules that a bad hand-timed caption would break: frame/ tick identity, SRT
// timestamp format, the line budget, monotonic non-overlapping cues per clip, and
// a contrast floor for the bar.
import { describe, expect, test } from "bun:test";
import {
  MAX_CHARS_PER_LINE,
  PALETTE,
  TICK_HZ,
  assTimestamp,
  contrastRatio,
  cueWindowMs,
  srtTimestamp,
  tickToFrames,
  toAss,
  toSrt,
  validateCues,
  validatePalette,
  type Cue,
} from "../src/lib/clip-spec";

const cue = (over: Partial<Cue> = {}): Cue => ({
  clip: "clip-03",
  index: 1,
  label: "03/06",
  text: "A fresh engine replays the trace.",
  tickIn: 120,
  tickOut: 300,
  ...over,
});

describe("tick <-> frame identity", () => {
  test("60 fps makes one tick one frame", () => {
    expect(TICK_HZ).toBe(60);
    for (const tick of [0, 1, 59, 60, 61, 1800, 3599]) {
      expect(tickToFrames(tick)).toBe(tick);
    }
  });

  test("a cue window is the tick delta in milliseconds", () => {
    expect(cueWindowMs(cue({ tickIn: 120, tickOut: 300 }))).toBe(3000);
  });
});

describe("srt timestamps", () => {
  test("format is HH:MM:SS,mmm", () => {
    expect(srtTimestamp(0)).toBe("00:00:00,000");
    expect(srtTimestamp(60)).toBe("00:00:01,000");
    expect(srtTimestamp(90)).toBe("00:00:01,500");
    expect(srtTimestamp(3600)).toBe("00:01:00,000");
    expect(srtTimestamp(216000)).toBe("01:00:00,000");
  });

  test("sub-ticks round to milliseconds without going backwards", () => {
    let prev = -1;
    for (let tick = 0; tick < 240; tick++) {
      const ms = Number(srtTimestamp(tick).slice(-3));
      const secs = srtTimestamp(tick).slice(0, 8).split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
      const total = secs * 1000 + ms;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  test("srt is ordered by tick and keeps pre-broken lines", () => {
    const srt = toSrt([
      cue({ index: 2, tickIn: 400, tickOut: 500, text: "second" }),
      cue({ index: 1, tickIn: 100, tickOut: 200, text: "first\nline two" }),
    ]);
    expect(srt.startsWith("1\n00:00:01,667 --> 00:00:03,333\nfirst\nline two")).toBe(true);
    expect(srt).toContain("2\n00:00:06,667 --> 00:00:08,333\nsecond");
  });
});

describe("cue validation", () => {
  test("a clean cue passes", () => {
    expect(validateCues([cue()])).toEqual([]);
  });

  test("no cues is a failure", () => {
    expect(validateCues([])).toEqual(["no cues"]);
  });

  test("line budget is enforced on both axes", () => {
    const long = validateCues([cue({ text: "x".repeat(MAX_CHARS_PER_LINE + 1) })]);
    expect(long.some((p) => p.includes("chars"))).toBe(true);

    const many = validateCues([cue({ text: "one\ntwo\nthree" })]);
    expect(many.some((p) => p.includes("lines"))).toBe(true);
  });

  test("overlapping cues in a clip are rejected", () => {
    const problems = validateCues([
      cue({ index: 1, tickIn: 100, tickOut: 300 }),
      cue({ index: 2, tickIn: 250, tickOut: 400 }),
    ]);
    expect(problems.some((p) => p.includes("starts before"))).toBe(true);
  });

  test("indices must run 1..n within a clip", () => {
    const problems = validateCues([
      cue({ index: 1, tickIn: 100, tickOut: 200 }),
      cue({ index: 3, tickIn: 200, tickOut: 300 }),
    ]);
    expect(problems.some((p) => p.includes("has index 3"))).toBe(true);
  });

  test("zero-length and negative windows are rejected", () => {
    expect(validateCues([cue({ tickIn: 200, tickOut: 200 })])).toContain(
      "clip-03#1: tickOut must be after tickIn",
    );
    expect(validateCues([cue({ tickIn: -1 })])).toContain("clip-03#1: tickIn is negative");
  });

  test("labels must be NN/NN", () => {
    expect(validateCues([cue({ label: "clip 3" })])).toContain(
      'clip-03#1: label "clip 3" is not NN/NN',
    );
  });
});

describe("burned-in bar (ASS)", () => {
  test("declares its own resolution, so style values are pixels", () => {
    const ass = toAss([cue()]);
    expect(ass).toContain("PlayResX: 1280");
    expect(ass).toContain("PlayResY: 800");
    expect(ass).toContain("WrapStyle: 2");
  });

  test("timecodes are H:MM:SS.cc and pre-broken lines become \\N", () => {
    expect(assTimestamp(0)).toBe("0:00:00.00");
    expect(assTimestamp(90)).toBe("0:00:01.50");
    expect(assTimestamp(216000)).toBe("1:00:00.00");

    const ass = toAss([cue({ text: "one\ntwo" })]);
    expect(ass).toContain(",one\\Ntwo");
  });

  test("events are ordered by tick", () => {
    const ass = toAss([
      cue({ index: 2, tickIn: 400, tickOut: 500, text: "second" }),
      cue({ index: 1, tickIn: 100, tickOut: 200, text: "first" }),
    ]);
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events[0]).toContain("0:00:01.67,0:00:03.33");
    expect(events[1]).toContain("second");
  });
});

describe("bar contrast", () => {  test("the shipped palette clears the floor", () => {
    expect(validatePalette()).toEqual([]);
    expect(contrastRatio(PALETTE.ink, PALETTE.bar)).toBeGreaterThan(12);
  });

  test("a low-contrast ink fails", () => {
    expect(validatePalette({ bar: "#101010", ink: "#1C1C1C", accent: PALETTE.accent }).length).toBe(1);
  });
});
