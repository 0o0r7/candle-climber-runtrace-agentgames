import { createHash } from "node:crypto";

/**
 * Pre-publication judge gate for the Creator Track entry.
 *
 * The verdict has to exist *before* the thread goes live: once the thread is
 * published, the entry is judged on what was live, so a verdict written
 * afterwards changes nothing. The gate therefore binds the verdict to the exact
 * material it reviewed — a digest over the thread text and the six clips — so
 * "reviewed" and "published" cannot drift apart.
 *
 * `bun scripts/publish-gate.ts` computes the current digest and refuses to pass
 * unless review-panel.md carries a signed verdict for that digest.
 */

export const AXES = [
  "technical-substance",
  "clarity",
  "zkverify-relevance",
  "originality",
] as const;

export type Axis = (typeof AXES)[number];

/** The exact material a verdict covers. Order is irrelevant: the digest sorts it. */
export const MATERIAL_FILES = [
  "docs/competition/thread-final.md",
  "docs/competition/media/clip-01-ticks.mp4",
  "docs/competition/media/clip-01-ticks.srt",
  "docs/competition/media/clip-02-signed.mp4",
  "docs/competition/media/clip-02-signed.srt",
  "docs/competition/media/clip-03-replay.mp4",
  "docs/competition/media/clip-03-replay.srt",
  "docs/competition/media/clip-04-flag.mp4",
  "docs/competition/media/clip-04-flag.srt",
  "docs/competition/media/clip-05-receipt.mp4",
  "docs/competition/media/clip-05-receipt.srt",
  "docs/competition/media/clip-06-endpoint.mp4",
  "docs/competition/media/clip-06-endpoint.srt",
] as const;

/** Reproduce the digest without bun, so the judge never has to trust this code. */
export const MATERIAL_LISTING_COMMAND =
  "sha256sum docs/competition/thread-final.md docs/competition/media/clip-*.mp4 docs/competition/media/clip-*.srt | LC_ALL=C sort -k2 | sha256sum";

export interface MaterialEntry {
  path: string;
  sha256: string;
}

export interface JudgeVerdict {
  verdict: string;
  judge: string;
  reviewedAt: string;
  materialDigest: string;
  axes: Record<Axis, number | null>;
}

/** sha256 over the sorted `<sha256>  <path>` listing — the same bytes the shell command prints. */
export function materialDigest(entries: MaterialEntry[]): string {
  const listing = [...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => `${e.sha256.toLowerCase()}  ${e.path}\n`)
    .join("");
  return createHash("sha256").update(listing).digest("hex");
}

/**
 * Read the last signed verdict block in review-panel.md. The ledger is
 * chronological, so the latest block is the one in force; a block that is still
 * a template keeps its `<...>` placeholders and fails validation instead of
 * being read as an approval.
 */
export function parseJudgeVerdict(markdown: string): JudgeVerdict | null {
  const last = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const match = /^(VERDICT|JUDGE|REVIEWED-AT|MATERIAL-SHA256|AXES):\s*(.*)$/.exec(line.trim());
    if (match) last.set(match[1], match[2].trim());
  }

  const verdict = last.get("VERDICT");
  if (!verdict) return null;

  const axesSource = last.get("AXES") ?? "";
  const axes = {} as Record<Axis, number | null>;
  for (const axis of AXES) {
    const match = new RegExp(`${axis}\\s*=\\s*(-?\\d+)`).exec(axesSource);
    axes[axis] = match ? Number(match[1]) : null;
  }

  return {
    verdict: verdict.toUpperCase(),
    judge: last.get("JUDGE") ?? "",
    reviewedAt: last.get("REVIEWED-AT") ?? "",
    materialDigest: (last.get("MATERIAL-SHA256") ?? "").toLowerCase(),
    axes,
  };
}

/** Empty array means the verdict holds for this material. */
export function validateJudgeVerdict(
  verdict: JudgeVerdict | null,
  currentDigest: string,
  now: Date = new Date(),
): string[] {
  if (!verdict) {
    return ["no judge verdict recorded — the thread cannot be published before a judge signs one"];
  }

  const problems: string[] = [];

  if (verdict.verdict !== "APPROVE") {
    problems.push(`verdict is ${verdict.verdict || "empty"}, not APPROVE`);
  }
  if (verdict.judge.length < 2 || verdict.judge.includes("<")) {
    problems.push("judge is unnamed — a verdict needs the person who issued it");
  }

  const reviewedAt = Date.parse(verdict.reviewedAt);
  if (Number.isNaN(reviewedAt)) {
    problems.push(`REVIEWED-AT is not an ISO timestamp: "${verdict.reviewedAt}"`);
  } else if (reviewedAt > now.getTime() + 5 * 60 * 1000) {
    problems.push("REVIEWED-AT is in the future");
  }

  if (!/^[0-9a-f]{64}$/.test(verdict.materialDigest)) {
    problems.push("MATERIAL-SHA256 is not a 64-character hex digest");
  } else if (verdict.materialDigest !== currentDigest) {
    problems.push(
      `MATERIAL-SHA256 ${verdict.materialDigest.slice(0, 12)}… does not match the current material ${currentDigest.slice(0, 12)}… — the verdict reviewed a different thread or clip set`,
    );
  }

  for (const axis of AXES) {
    const score = verdict.axes[axis];
    if (score === null) {
      problems.push(`axis ${axis} is unscored`);
    } else if (!Number.isInteger(score) || score < 1 || score > 5) {
      problems.push(`axis ${axis} is ${score}, outside 1–5`);
    } else if (score < 3) {
      problems.push(`axis ${axis} is ${score}, below the floor of 3`);
    }
  }
  const substance = verdict.axes["technical-substance"];
  if (substance !== null && substance < 4) {
    problems.push(`technical substance is ${substance}, below the required 4`);
  }

  return problems;
}
