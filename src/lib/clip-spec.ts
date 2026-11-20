/**
 * Clip spec — the mechanical half of the video production standard
 * (docs/competition/video-production-standard.md).
 *
 * Every caption boundary is expressed in SIMULATION TICKS, never in wall-clock
 * seconds typed by hand. At TICK_HZ = 60 a constant-frame-rate render of N ticks
 * is exactly N frames, so "frame count equals tick count" is a proof of sync
 * rather than a visual impression. Pure functions only: no clock, no I/O, so the
 * rules can be tested without a renderer.
 */

export const TICK_HZ = 60;

// Frame geometry. The game is never cropped and the bar never covers it.
export const FRAME_W = 1280;
export const FRAME_H = 800;
export const GAME_H = 720;
export const BAR_H = 80;
export const SAFE_BOTTOM = 24;

// Text budget. Lines are pre-broken in the cue file so the renderer never wraps.
export const MAX_LINES = 2;
export const MAX_CHARS_PER_LINE = 44;
export const MIN_CONTRAST = 4.5;

/** Opaque bar, high-contrast ink, one accent. Contrast is a rule, not a taste. */
export const PALETTE = { bar: "#0B0D10", ink: "#F2F5F7", accent: "#F0B429" } as const;

export interface Cue {
  /** Clip id, e.g. "clip-03". */
  clip: string;
  /** 1-based position inside the clip. */
  index: number;
  /** Series label burned into the bar's left padding, e.g. "03/06". */
  label: string;
  /** On-screen text. Use "\n" for the pre-broken line break. */
  text: string;
  /** Tick the cue appears. */
  tickIn: number;
  /** Tick the cue clears. */
  tickOut: number;
}

export function tickToSeconds(tick: number): number {
  return tick / TICK_HZ;
}

/** Frame index for a tick at a given constant frame rate (identity at 60 fps). */
export function tickToFrames(tick: number, fps: number = TICK_HZ): number {
  return Math.round(tickToSeconds(tick) * fps);
}

export function cueWindowMs(cue: Cue): number {
  return (cue.tickOut - cue.tickIn) * (1000 / TICK_HZ);
}

/** `HH:MM:SS,mmm` — the only timestamp format SRT accepts. */
export function srtTimestamp(tick: number): string {
  const totalMs = Math.round(tickToSeconds(tick) * 1000);
  const ms = totalMs % 1000;
  const totalSec = (totalMs - ms) / 1000;
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, "0")}`;
}

/** SRT generated from the same cue list the burned-in bar uses — they cannot disagree. */
export function toSrt(cues: Cue[]): string {
  return [...cues]
    .sort((a, b) => a.tickIn - b.tickIn)
    .map((cue, i) => `${i + 1}\n${srtTimestamp(cue.tickIn)} --> ${srtTimestamp(cue.tickOut)}\n${cue.text}\n`)
    .join("\n");
}

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every problem that would make a clip unacceptable. An empty array is the only
 * passing result — the render step refuses to run otherwise.
 */
export function validateCues(cues: Cue[]): string[] {
  const problems: string[] = [];
  if (cues.length === 0) problems.push("no cues");

  const seen = new Set<string>();
  const byClip = new Map<string, Cue[]>();

  for (const cue of cues) {
    const at = `${cue.clip}#${cue.index}`;
    if (seen.has(at)) problems.push(`${at}: duplicate cue index`);
    seen.add(at);

    if (!cue.text.trim()) problems.push(`${at}: empty text`);

    const lines = cue.text.split("\n");
    if (lines.length > MAX_LINES) problems.push(`${at}: ${lines.length} lines (max ${MAX_LINES})`);
    for (const line of lines) {
      if (line.length > MAX_CHARS_PER_LINE) {
        problems.push(`${at}: line is ${line.length} chars (max ${MAX_CHARS_PER_LINE})`);
      }
    }

    if (!/^\d{2}\/\d{2}$/.test(cue.label)) problems.push(`${at}: label "${cue.label}" is not NN/NN`);

    if (!Number.isInteger(cue.tickIn) || !Number.isInteger(cue.tickOut)) {
      problems.push(`${at}: ticks must be integers`);
    }
    if (cue.tickIn < 0) problems.push(`${at}: tickIn is negative`);
    if (cue.tickOut <= cue.tickIn) problems.push(`${at}: tickOut must be after tickIn`);

    const list = byClip.get(cue.clip) ?? [];
    list.push(cue);
    byClip.set(cue.clip, list);
  }

  for (const [clip, list] of byClip) {
    const sorted = [...list].sort((a, b) => a.tickIn - b.tickIn);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].tickIn < sorted[i - 1].tickOut) {
        problems.push(`${clip}: cue ${sorted[i].index} starts before cue ${sorted[i - 1].index} clears`);
      }
    }
    sorted.forEach((cue, i) => {
      if (cue.index !== i + 1) problems.push(`${clip}: cue at position ${i + 1} has index ${cue.index}`);
    });
  }

  return problems;
}

/** Palette problems, kept separate so a design change fails loudly. */
export function validatePalette(palette: { bar: string; ink: string; accent: string } = PALETTE): string[] {
  const problems: string[] = [];
  const ink = contrastRatio(palette.ink, palette.bar);
  if (ink < MIN_CONTRAST) {
    problems.push(`ink on bar is ${ink.toFixed(2)}:1 (min ${MIN_CONTRAST}:1)`);
  }
  const accent = contrastRatio(palette.accent, palette.bar);
  if (accent < MIN_CONTRAST) {
    problems.push(`accent on bar is ${accent.toFixed(2)}:1 (min ${MIN_CONTRAST}:1)`);
  }
  return problems;
}

/** Bar typography, in real pixels because the ASS declares its own resolution. */
export const ASS_STYLE = {
  // Must be the family the shipped font file actually declares — libass does not
  // fail loudly when it cannot resolve one, it silently draws nothing.
  fontName: "DejaVu Sans",
  fontSize: 30,
  marginL: 76,
  marginR: 24,
  marginV: 30,
} as const;

/** ASS timecode `H:MM:SS.cc` — centiseconds, one decimal place fewer than SRT. */
export function assTimestamp(tick: number): string {
  const totalCs = Math.round(tickToSeconds(tick) * 100);
  const cs = totalCs % 100;
  const totalSec = (totalCs - cs) / 100;
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p2(m)}:${p2(s)}.${p2(cs)}`;
}

/**
 * ASS for the burned-in bar.
 *
 * SRT is shipped alongside for accessibility, but it is the wrong format for the
 * bar: libass scales an SRT's `force_style` from a default 384x288 script
 * resolution, so `FontSize` and `MarginV` are not pixels and the text lands
 * somewhere you did not choose. Declaring PlayResX/PlayResY makes the geometry
 * exact, which is the only way the bar can be specified and checked.
 */
export function toAss(cues: Cue[]): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${FRAME_W}`,
    `PlayResY: ${FRAME_H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Ink #F2F5F7 -> &H00F7F5F2 (ASS is AABBGGRR), alignment 2 = bottom centre.
    `Style: Bar,${ASS_STYLE.fontName},${ASS_STYLE.fontSize},&H00F7F5F2,&H00F7F5F2,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,${ASS_STYLE.marginL},${ASS_STYLE.marginR},${ASS_STYLE.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = [...cues]
    .sort((a, b) => a.tickIn - b.tickIn)
    .map((cue) => {
      const text = cue.text.replace(/\n/g, "\\N");
      return `Dialogue: 0,${assTimestamp(cue.tickIn)},${assTimestamp(cue.tickOut)},Bar,,0,0,0,,${text}`;
    });

  return `${[...header, ...events].join("\n")}\n`;
}
