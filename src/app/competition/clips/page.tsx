import type { Metadata } from "next";

// /competition/clips — review surface for the six corrected Creator-track clips.
//
// The rendered masters live in docs/competition/media/ (the source of truth, hashed
// by the publish gate). public/competition/media/ holds the byte-identical mirror
// that this page serves, because a Next dev/production server can only stream
// files from `public`. Re-copy the six files there whenever a clip is re-rendered:
//
//   cp docs/competition/media/clip-0* public/competition/media/
//
// Each entry states the claim the clip proves (docs/competition/thread-final.md),
// the burned-in captions it carries, and its measured length.

export const metadata: Metadata = {
  title: "Creator track clips — corrected masters",
  description:
    "The six Creator-track clips, re-rendered with corrected camera framing and synthesised audio. Downloadable masters plus their SRT sidecars.",
};

interface Clip {
  n: string;
  file: string;
  claim: string;
  captions: string[];
  seconds: number;
}

const CLIPS: Clip[] = [
  {
    n: "01",
    file: "clip-01-ticks",
    claim: "Input is recorded at the 60 Hz tick boundary.",
    captions: ["Real input from a deterministic bot.", "Every press stamped at the 60 Hz tick."],
    seconds: 12.75,
  },
  {
    n: "02",
    file: "clip-02-signed",
    claim: "The terrain is server-signed.",
    captions: ["The level is signed: an HMAC run token.", "Candles are fingerprinted, not trusted."],
    seconds: 15,
  },
  {
    n: "03",
    file: "clip-03-replay",
    claim: "A fresh engine instance replays the trace.",
    captions: ["A fresh engine replays the trace.", "Score, jumps, landings must match."],
    seconds: 7.27,
  },
  {
    n: "04",
    file: "clip-04-flag",
    claim: "A tampered claim returns FLAG with a reason.",
    captions: ["Add one point to the claim.", "The replay returns FLAG: score_mismatch."],
    seconds: 14.8,
  },
  {
    n: "05",
    file: "clip-05-receipt",
    claim: "The receipt stores the trace and re-verifies.",
    captions: ["The receipt stores the trace itself.", "Reopen it: same trace, same totals."],
    seconds: 12.83,
  },
  {
    n: "06",
    file: "clip-06-endpoint",
    claim: "The agent endpoint rejects an unsigned request.",
    captions: ["The agent endpoint takes signed tasks.", "Unsigned POST: 401, before any work."],
    seconds: 11.5,
  },
];

const BASE = "/competition/media";

export default function ClipsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-white/90">
      <h1 className="text-3xl font-bold tracking-tight text-white">Creator track — corrected clips</h1>
      <p className="mt-2 text-sm text-white/60">
        Six clips, 1280×800 at a constant 60 fps, each rendered from simulation ticks with a synthesised score
        underneath. Camera framing was reworked so every landing platform stays in view; the burned-in caption
        bar sits below the game frame and never covers it. Every clip has an SRT sidecar generated from the same
        cue list as the burned-in text.
      </p>

      <ol className="mt-10 space-y-12">
        {CLIPS.map((clip) => (
          <li key={clip.file}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">
                <span className="text-white/40">{clip.n}/06</span> {clip.claim}
              </h2>
              <span className="font-mono text-xs text-white/40">{clip.seconds.toFixed(2)}s</span>
            </div>

            <video
              className="mt-3 w-full rounded-lg border border-white/10 bg-black"
              controls
              preload="metadata"
              playsInline
              width={1280}
              height={800}
              src={`${BASE}/${clip.file}.mp4`}
            >
              <track kind="captions" src={`${BASE}/${clip.file}.srt`} srcLang="en" label="English" default />
            </video>

            <ul className="mt-2 space-y-0.5 font-mono text-xs text-white/50">
              {clip.captions.map((line) => (
                <li key={line}>&ldquo;{line}&rdquo;</li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <a className="text-white underline underline-offset-4 hover:text-white/70" href={`${BASE}/${clip.file}.mp4`} download>
                Download MP4
              </a>
              <a className="text-white/60 underline underline-offset-4 hover:text-white" href={`${BASE}/${clip.file}.srt`} download>
                Download SRT
              </a>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-12 text-xs text-white/40">
        Masters: <code className="font-mono">docs/competition/media/</code>. Publication stays gated on a signed
        judge verdict over the material hash (see <code className="font-mono">docs/competition/review-panel.md</code>).
      </p>
    </main>
  );
}
