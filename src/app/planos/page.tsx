export const dynamic = 'force-static'

import type { ReactNode } from 'react'
import BrandLogo from '@/components/BrandLogo'

 

function Feature({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-white/80">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50" />
      <span>{children}</span>
    </li>
  )
}

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-[#0f1115] text-white">
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0f1115]/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <BrandLogo />
          </a>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-16 space-y-12">
        {/* Hero */}
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Pricing designed for regulated AI systems
          </h1>
          <p className="text-white/70 max-w-2xl">
            Transparent annual pricing based on use cases — not decision volume. Used by compliance,
            risk and legal teams to prove human oversight over AI decisions.
          </p>
          <div className="flex gap-3">
            <a href="/contact" className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>
            <a href="/contact" className="px-4 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm">Request Demo</a>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sandbox (optional) */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6 flex flex-col gap-4">
            <div>
              <p className="text-xs text-white/50">Sandbox</p>
              <h3 className="text-xl font-semibold">Free</h3>
              <p className="text-white/60 text-sm mt-1">1 use case (test), Sandbox only</p>
            </div>
            <ul className="space-y-2">
              <Feature>Unlimited decisions (fair use)</Feature>
              <Feature>HITL records</Feature>
              <Feature>Basic dashboard</Feature>
              <Feature>30-day retention</Feature>
            </ul>
            <div className="mt-auto">
              <a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-md text-sm">Talk to Sales</a>
            </div>
          </div>

          {/* Team */}
          <div className="bg-white/[0.03] border border-white/[0.12] rounded-lg p-6 flex flex-col gap-4">
            <div>
              <p className="text-xs text-white/50">Team</p>
              <h3 className="text-xl font-semibold">On request</h3>
              <p className="text-white/50 text-xs">Annual contract • Pricing based on use cases</p>
              <p className="text-white/60 text-sm mt-1">For early-stage startups</p>
            </div>
            <ul className="space-y-2">
              <Feature>2 use cases</Feature>
              <Feature>Unlimited decisions (fair use)</Feature>
              <Feature>Human oversight evidence</Feature>
              <Feature>Forensic export</Feature>
              <Feature>2-year retention</Feature>
              <Feature>Email support</Feature>
            </ul>
            <div className="mt-auto">
              <a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>
            </div>
          </div>

          {/* Business (highlight) */}
          <div className="bg-white/[0.06] border border-white/[0.18] rounded-lg p-6 flex flex-col gap-4 relative">
            <span className="absolute -top-2 right-3 text-[10px] px-2 py-0.5 rounded bg-white/[0.12] text-white/80 border border-white/[0.18]">Most popular</span>
            <div>
              <p className="text-xs text-white/50">Business</p>
              <h3 className="text-xl font-semibold">On request</h3>
              <p className="text-white/50 text-xs">Annual contract • Pricing based on use cases</p>
              <p className="text-white/60 text-sm mt-1">For growing companies</p>
            </div>
            <ul className="space-y-2">
              <Feature>5 use cases</Feature>
              <Feature>Everything in Team</Feature>
              <Feature>5-year retention</Feature>
              <Feature>Priority support</Feature>
              <Feature>Compliance export formats</Feature>
              <Feature>POV eligible ($5k credited)</Feature>
            </ul>
            <div className="mt-auto">
              <a href="/contact" className="block w-full text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Talk to Sales</a>
            </div>
          </div>

          {/* Enterprise */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6 flex flex-col gap-4">
            <div>
              <p className="text-xs text-white/50">Enterprise</p>
              <h3 className="text-xl font-semibold">On request</h3>
              <p className="text-white/50 text-xs">Annual contract • Pricing based on use cases</p>
              <p className="text-white/60 text-sm mt-1">For regulated enterprises</p>
            </div>
            <ul className="space-y-2">
              <Feature>10+ use cases</Feature>
              <Feature>7-year retention</Feature>
              <Feature>SSO (SAML / OIDC)</Feature>
              <Feature>Data residency</Feature>
              <Feature>Dedicated support</Feature>
              <Feature>Legal & compliance onboarding</Feature>
            </ul>
            <div className="mt-auto flex gap-2">
              <a href="/contact" className="w-1/2 text-center px-3 py-2 border border-white/15 hover:bg-white/[0.06] rounded-md text-sm">Contact Sales</a>
              <a href="/contact" className="w-1/2 text-center px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Request Demo</a>
            </div>
          </div>
        </div>

        {/* All plans include */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
          <h3 className="text-sm font-medium text-white/80 mb-3">All plans include</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Feature>Unlimited decisions (fair use)</Feature>
            <Feature>Unlimited human interventions</Feature>
            <Feature>Cryptographic audit trail</Feature>
            <Feature>Offline-verifiable evidence bundles</Feature>
            <Feature>No decision-based pricing</Feature>
            <Feature>No surprise overages</Feature>
          </ul>
        </div>

        {/* Expansion by Use Case */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6">
          <h3 className="text-sm font-medium text-white/80 mb-2">Need more use cases?</h3>
          <p className="text-sm text-white/70">Add use cases as you scale — $500 to $8,000 / year per additional use case. No migration between plans required.</p>
        </div>

        {/* POV callout */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-white/90">Not ready for an annual commitment?</h3>
            <p className="text-sm text-white/70">Start with a 30-day Proof of Value. $5,000 — fully credited if you proceed.</p>
          </div>
          <a href="/contact" className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm">Start a Proof of Value</a>
        </div>
      </div>
    </div>
  )
}
