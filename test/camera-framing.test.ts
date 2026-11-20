import { describe, expect, test } from "bun:test";
import {
  CAM_TOP_MARGIN,
  VIEW_H,
  cameraFollowTarget,
  cameraFramedTarget,
} from "@/game/cc/engine";

// Camera-frame v4 (owner report 2026-11-20): a drop used to pin the frame to the
// takeoff platform, so the platform the player was heading for sat below the
// frame edge. The render camera now pulls down to hold it — but never past the
// player's headroom, and never at all when normal play already fits.
describe("camera framing", () => {
  const ground = 1000; // takeoff platform y
  const standing = ground - 40; // player top while standing on it

  test("normal play is untouched: a landing platform above the player changes nothing", () => {
    const follow = cameraFollowTarget(standing, ground);
    expect(cameraFramedTarget(follow, standing, ground - 96)).toBe(follow);
  });

  test("a drop that fits pulls the frame down until the landing platform is visible", () => {
    const py = ground - 40 - 300; // apex, 300 px above the takeoff platform
    const landing = ground + 60; // next platform 60 px below it
    const follow = cameraFollowTarget(py, ground);
    const framed = cameraFramedTarget(follow, py, landing);

    expect(framed).toBeGreaterThan(follow);
    expect(landing - framed).toBeLessThanOrEqual(VIEW_H);
    expect(py - framed).toBeGreaterThanOrEqual(0);
  });

  test("a drop too tall to fit keeps the player in frame instead of faking it", () => {
    const py = ground - 40 - 300;
    const landing = ground + 600;
    const framed = cameraFramedTarget(cameraFollowTarget(py, ground), py, landing);

    expect(py - framed).toBe(CAM_TOP_MARGIN);
    expect(landing - framed).toBeGreaterThan(VIEW_H);
  });

  test("no platform ahead leaves the follow law exactly as it was", () => {
    const follow = cameraFollowTarget(standing, ground);
    expect(cameraFramedTarget(follow, standing, null)).toBe(follow);
  });
});
