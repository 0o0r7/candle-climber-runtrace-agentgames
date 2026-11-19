import { afterAll, beforeAll } from "bun:test";

/**
 * Pins the store factories to their in-memory backend for this test file.
 *
 * The sandbox/dev environment sets DATABASE_URL for the running app, and the
 * factories (`getScoreReports`, `getWeights`, `getPredictions`) select MongoDB
 * whenever it is a mongodb:// URI. Without this guard these tests would read
 * and write the live database, so their assertions would depend on rows left
 * by earlier runs — green on a fresh database, red on the second run.
 *
 * The variable is restored after the file so other test files see the real
 * environment.
 */
export function pinMemoryStores(): void {
  const saved = process.env.DATABASE_URL;
  beforeAll(() => {
    delete process.env.DATABASE_URL;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });
}
