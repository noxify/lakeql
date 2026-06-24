import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

import {
  HeroSection,
  GettingStartedSection,
  CtaSection,
  FeaturesSection,
  PoweredBySection,
  OpenSourceSection,
} from "./_sections"

export default function Page() {
  return (
    <div className="relative min-h-svh">
      <SiteHeader />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-152 bg-linear-to-br from-[#f5f7fa] via-[#d8dee8] to-[#c3cfe2] mask-[linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] dark:hidden" />
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-152 bg-linear-to-br from-[#1f2937] via-[#111827] to-[#020617] mask-[linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] dark:block" />

      <HeroSection />
      <GettingStartedSection />
      <CtaSection />
      <FeaturesSection />
      <PoweredBySection />
      <OpenSourceSection />

      <SiteFooter />
    </div>
  )
}
