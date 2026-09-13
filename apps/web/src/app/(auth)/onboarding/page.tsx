import type { Metadata } from "next";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export const metadata: Metadata = { title: "Pick your anonymous name" };

/** Post-login step: choose the anonymous username shown everywhere. */
export default function OnboardingPage() {
  return <OnboardingForm />;
}
