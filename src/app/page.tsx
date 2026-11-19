import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import PipelineSection from "@/components/landing/PipelineSection";
import WickSection from "@/components/landing/WickSection";
import ReceiptTeaser from "@/components/landing/ReceiptTeaser";
import ModeSelect from "@/components/landing/ModeSelect";
import HowToPlay from "@/components/landing/HowToPlay";
import Features from "@/components/landing/Features";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="lp-root rl-root">
      <LandingNav />
      <LandingHero />
      <PipelineSection />
      <WickSection />
      <ReceiptTeaser />
      <ModeSelect />
      <HowToPlay />
      <Features />
      <Footer />
    </div>
  );
}
