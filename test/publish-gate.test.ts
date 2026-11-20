import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  AXES,
  materialDigest,
  parseJudgeVerdict,
  validateJudgeVerdict,
  type JudgeVerdict,
} from "@/lib/publish-gate";

const NOW = new Date("2026-11-20T12:00:00Z");

function signed(overrides: Partial<JudgeVerdict> = {}): string {
  const verdict: JudgeVerdict = {
    verdict: "APPROVE",
    judge: "reviewer-handle",
    reviewedAt: "2026-11-20T10:00:00Z",
    materialDigest: "a".repeat(64),
    axes: {
      "technical-substance": 5,
      clarity: 4,
      "zkverify-relevance": 3,
      originality: 4,
    },
    ...overrides,
  };
  return [
    "### Judge verdict",
    "",
    "```text",
    `VERDICT: ${verdict.verdict}`,
    `JUDGE: ${verdict.judge}`,
    `REVIEWED-AT: ${verdict.reviewedAt}`,
    `MATERIAL-SHA256: ${verdict.materialDigest}`,
    `AXES: ${AXES.map((axis) => `${axis}=${verdict.axes[axis]}`).join(" ")}`,
    "```",
  ].join("\n");
}

describe("publish gate", () => {
  test("digest matches the documented shell command over the same listing", () => {
    const entries = [
      { path: "b.mp4", sha256: "2".repeat(64) },
      { path: "a.md", sha256: "1".repeat(64) },
    ];
    const listing = `${"1".repeat(64)}  a.md\n${"2".repeat(64)}  b.mp4\n`;
    expect(materialDigest(entries)).toBe(createHash("sha256").update(listing).digest("hex"));
    expect(materialDigest([...entries].reverse())).toBe(materialDigest(entries));
  });

  test("a signed verdict for the current material passes", () => {
    const markdown = signed();
    const digest = materialDigest([{ path: "a.md", sha256: "1".repeat(64) }]);
    const verdict = parseJudgeVerdict(markdown.replace(/a{64}/, digest));
    expect(validateJudgeVerdict(verdict, digest, NOW)).toEqual([]);
  });

  test("no verdict blocks publishing", () => {
    const problems = validateJudgeVerdict(null, "a".repeat(64), NOW);
    expect(problems[0]).toContain("no judge verdict recorded");
  });

  test("an unsigned template blocks publishing", () => {
    const template = signed({
      verdict: "<APPROVE | REJECT>",
      judge: "<name / handle>",
      reviewedAt: "<ISO 8601>",
      materialDigest: "<sha256>",
    });
    const problems = validateJudgeVerdict(parseJudgeVerdict(template), "a".repeat(64), NOW);
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.join("\n")).toContain("not APPROVE");
  });

  test("a verdict for different material blocks publishing", () => {
    const problems = validateJudgeVerdict(
      parseJudgeVerdict(signed()),
      "b".repeat(64),
      NOW,
    );
    expect(problems.join("\n")).toContain("does not match the current material");
  });

  test("a verdict dated after the publish moment is rejected", () => {
    const problems = validateJudgeVerdict(
      parseJudgeVerdict(signed({ reviewedAt: "2026-11-21T09:00:00Z" })),
      "a".repeat(64),
      NOW,
    );
    expect(problems.join("\n")).toContain("in the future");
  });

  test("axis floors are enforced", () => {
    const weak = signed({
      axes: {
        "technical-substance": 3,
        clarity: 2,
        "zkverify-relevance": 3,
        originality: 4,
      },
    });
    const problems = validateJudgeVerdict(parseJudgeVerdict(weak), "a".repeat(64), NOW);
    expect(problems.join("\n")).toContain("clarity is 2");
    expect(problems.join("\n")).toContain("technical substance is 3");
  });

  test("the latest block in the ledger is the one in force", () => {
    const markdown = [
      signed({ verdict: "REJECT" }),
      "",
      "---",
      "",
      signed({ verdict: "APPROVE" }),
    ].join("\n");
    expect(parseJudgeVerdict(markdown)?.verdict).toBe("APPROVE");
  });
});
