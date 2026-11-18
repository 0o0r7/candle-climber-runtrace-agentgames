import RunProofDemo from "@/components/runproof/RunProofDemo";

export const metadata = {
  title: "RunTrace — local deterministic QA workbench",
  description: "Capture, import, replay-check, and export Candle Climber run traces locally; no cryptographic proof.",
  robots: { index: false, follow: false },
};

export default function RunProofPage() {
  return <RunProofDemo />;
}
