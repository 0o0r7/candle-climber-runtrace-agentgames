import RunProofDemo from "@/components/runproof/RunProofDemo";

export const metadata = {
  title: "RunTrace — deterministic replay-consistency check",
  description: "A local replay-consistency check; no cryptographic proof.",
  robots: { index: false, follow: false },
};

export default function RunProofPage() {
  return <RunProofDemo />;
}
