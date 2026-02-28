import CTA from "@/components/CTA";
import { FeatureFive } from "@/components/FeatureFive";
import FeatureFour from "@/components/FeatureFour";
import FeatureOne from "@/components/FeatureOne";
import FeatureThree from "@/components/FeatureThree";
import FeatureTwo from "@/components/FeatureTwo";
import Footer from "@/components/Footer";
import HeroSection from "@/components/hero-section";
import LogoMarquee from "@/components/LogoMarquee";

export default function Home() {
  return (
    <div>
      <HeroSection />
      <LogoMarquee />
      <FeatureOne />
      <FeatureTwo />
      <FeatureThree />
      <FeatureFour />
      <FeatureFive />
      <CTA />
      <Footer />
    </div>
  );
}
