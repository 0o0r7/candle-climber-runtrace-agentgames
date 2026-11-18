import type { InputAction, InputEvent } from "./types";

/**
 * Quantizes browser input to the next simulation boundary. Call beginTick()
 * immediately before applying inputs and advancing Engine.step(FIXED_DT), then
 * call endTick() exactly once after that step completes.
 */
export class FixedTickInputRecorder {
  private pending: InputAction[] = [];
  private events: InputEvent[] = [];
  private nextTick = 0;

  get tick(): number {
    return this.nextTick;
  }

  queue(action: InputAction): void {
    this.pending.push(action);
  }

  beginTick(): InputEvent[] {
    const tick = this.nextTick;
    const actions = this.pending.splice(0, this.pending.length);
    const stamped = actions.map((action) => ({ tick, action }));
    this.events.push(...stamped);
    return stamped;
  }

  endTick(): void {
    this.nextTick += 1;
  }

  snapshot(): InputEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}
