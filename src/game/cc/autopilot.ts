// Autopilot — drives a silent Engine for showcase loops (never used in real
// scored runs, never posts scores on its own).
//
// Why not RivalBot: the engine ungrounds the player the same tick they touch a
// red candle (a crumbling platform is no longer "solid"), leaving only the
// coyote window to jump. RivalBot re-arms its jump only on a grounded landing,
// so it never jumps off a red candle. This pilot re-arms on every landing and
// plans the whole take-off window (walk / coyote) at once.
//
// Deterministic: physics depends only on the number of fixed steps, so a run
// is identical in every browser and can be recorded as fixed-tick inputs and
// replayed by the RunTrace verifier.
//
// Used by the landing gameplay demo and the RunTrace showcase.
import { Engine, GRAVITY, PLAYER_W, PLAYER_H, CAM_BASE, CAM_ACCEL, CAM_MAX } from "./engine";
import { buildPlatforms } from "./level";
import { BASE_MODS, type MutationMods } from "./mutations";
import { evalPressNow, FIXED_DT, type PressEval } from "./rival/planner";
import { mulberry32 } from "./rng";
import type { Candle, Platform } from "./types";

/** Below this landing margin (px) an option counts as "edgy". */
const SAFE_MARGIN = 10;
/** Longest take-off window we plan over (ticks). */
const MAX_WAIT = 300;

interface Plan { wait: number; hold: boolean }

/** Every press/release the pilot issues, stamped with the tick it applies to.
 *  RunTrace records these as fixed-tick inputs. */
export type AutopilotObserver = (action: "jump-down" | "jump-up", tick: number) => void;

export interface AutopilotOptions {
  /** Mutation mods for the level (defaults to BASE_MODS). The caller must use
   *  the same mods when replaying the recorded run. */
  mods?: MutationMods;
  /** Pre-built engine with the caller's callbacks (score/sfx/death capture).
   *  Must be built from the same candles, seed and mods. */
  engine?: Engine;
  observer?: AutopilotObserver;
  /** Style dial, 0–1. 0 (default) always takes the most centered landing; higher
   *  values let the pilot settle for an edgier option now and then, the way a
   *  human plays. Still deterministic for a given value: the showcase varies it
   *  per take so each take is a different real run. */
  variation?: number;
}

export class Autopilot {
  readonly eng: Engine;
  private readonly observer?: AutopilotObserver;
  private armed = false;
  private baseIdx = -1;
  private plan: Plan | null = null;
  private cutPending = false;
  private tickIndex = 0;
  private readonly variation: number;
  private readonly rng: () => number;

  constructor(candles: Candle[], seed: string, options: AutopilotOptions = {}) {
    const mods = options.mods ?? BASE_MODS;
    this.eng = options.engine
      ?? new Engine(buildPlatforms(candles, seed), { onDeath: () => {}, onScore: () => {} }, mods, seed);
    this.observer = options.observer;
    this.variation = Math.max(0, Math.min(1, options.variation ?? 0));
    this.rng = mulberry32(Math.round(this.variation * 0xffffffff) || 1);
  }

  /** Fixed steps completed so far (the tick that will be stepped next). */
  get ticks(): number {
    return this.tickIndex;
  }

  tick() {
    const e = this.eng;
    if (e.dead) return;
    if (this.cutPending) {
      e.release(); // jump-cut one tick after the press (planner's cut variant)
      this.observer?.("jump-up", this.tickIndex);
      this.cutPending = false;
    } else if (this.armed) {
      if (!this.plan) this.plan = this.makePlan();
      if (this.plan.wait <= 0) {
        e.press();
        this.observer?.("jump-down", this.tickIndex);
        if (!this.plan.hold) this.cutPending = true;
        this.armed = false;
        this.plan = null;
      } else {
        this.plan.wait--;
      }
    }
    e.step(FIXED_DT);
    this.tickIndex += 1;
    // the engine zeroes vy only when the feet touch a platform
    if (e.vy === 0 && !this.armed && !this.cutPending) this.onLanded();
  }

  private onLanded() {
    const e = this.eng;
    const feet = e.py + PLAYER_H;
    const p = e.plats.find((q) => q.w > 0 && Math.abs(q.y - feet) < 0.5 && e.px + PLAYER_W > q.x + 6 && e.px < q.x + q.w - 2);
    this.baseIdx = p ? p.i : this.baseIdx;
    this.armed = true;
    this.plan = null;
  }

  private standingOn(px: number, feet: number): Platform | undefined {
    const plats = this.eng.plats;
    for (let i = Math.max(0, this.baseIdx); i < Math.min(plats.length, this.baseIdx + 4); i++) {
      const q = plats[i];
      if (q.state === "solid" && !q.crumble && Math.abs(q.y - feet) < 0.5 && px + PLAYER_W > q.x + 6 && px < q.x + q.w - 2) return q;
    }
    return undefined;
  }

  /** Scan every press moment in the take-off window and rank the landings. */
  private makePlan(): Plan {
    const e = this.eng;
    let px = e.px, py = e.py, vy = e.vy, t = e.time, coyote = e.coyote;
    const candidates: { wait: number; hold: boolean; score: number }[] = [];
    let lastValid = 0;

    for (let wait = 0; wait <= MAX_WAIT; wait++) {
      // the press is valid if the jump can still execute in the next step
      const onGround = !!this.standingOn(px + speedAt(t + FIXED_DT) * FIXED_DT, py + PLAYER_H);
      if (!onGround && coyote - FIXED_DT <= 0) break;
      lastValid = wait;

      const ev = evalPressNow(
        { px, py, vy, grounded: true, groundIdx: this.baseIdx, time: t, rush: false, sinceLand: 1 },
        e.plats, e.mods, false,
      );
      for (const [c, hold] of [[ev.full, true], [ev.cut, false]] as [PressEval, boolean][]) {
        if (!c.ok) continue;
        // centered landings win; green targets get a bonus (reds force an instant re-jump)
        const score = Math.min(c.margin, 30) + (c.risky ? 0 : 6) + (c.margin >= SAFE_MARGIN ? 20 : 0);
        candidates.push({ wait, hold, score });
      }

      // advance one idle tick (mirror of engine.step without a press)
      t += FIXED_DT;
      px += speedAt(t) * FIXED_DT;
      coyote = Math.max(0, coyote - FIXED_DT);
      if (this.standingOn(px, py + PLAYER_H)) {
        vy = 0;
        coyote = 0.12;
      } else {
        vy += GRAVITY * FIXED_DT;
        py += vy * FIXED_DT;
      }
    }
    // nothing lands — jump at the last possible moment (go out jumping)
    if (candidates.length === 0) return { wait: lastValid, hold: true };
    candidates.sort((a, b) => b.score - a.score);
    // Style dial: 0 always takes the best landing; higher values sometimes settle
    // for one of the next-best take-off moments, the way a human plays.
    const pool = candidates.slice(0, 12);
    const pick = this.variation > 0 && pool.length > 1 && this.rng() < this.variation
      ? pool[1 + Math.floor(this.rng() * (pool.length - 1))]
      : pool[0];
    return { wait: pick.wait, hold: pick.hold };
  }
}

function speedAt(time: number): number {
  return Math.min(CAM_MAX, CAM_BASE + time * CAM_ACCEL);
}
