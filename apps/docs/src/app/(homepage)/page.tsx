import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

import {
  HeroSection,
  MultiAdapterSection,
  FeaturesSection,
  PoweredBySection,
  OpenSourceSection,
} from "./_sections"

export default function Page() {
  return (
    <div className="relative min-h-svh">
      <SiteHeader />

      <HeroSection />
      <MultiAdapterSection />
      <FeaturesSection />
      <PoweredBySection />
      <OpenSourceSection />

      <SiteFooter />
    </div>
  )
}
