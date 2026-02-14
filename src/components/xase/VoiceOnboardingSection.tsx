"use client"

import { useEffect, useState } from "react"
import { OnboardingWizard } from "@/components/xase/OnboardingWizard"

export function VoiceOnboardingSection() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function checkProgress() {
      try {
        const res = await fetch("/api/onboarding/progress")
        if (!res.ok) throw new Error("Failed to load onboarding progress")
        const data = await res.json()
        // API shape: { progress, percentage }
        const progress = data?.progress
        const completed = Boolean(progress?.completedAt)
        // On this page, we ignore skipped to keep guiding the user to the next step
        if (!cancelled) setShowOnboarding(!completed)
      } catch {
        // If unknown, be safe and show it so the user can finish
        if (!cancelled) setShowOnboarding(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    checkProgress()
    return () => { cancelled = true }
  }, [])

  // Allow closing with Escape key when modal is open
  useEffect(() => {
    if (!showOnboarding) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOnboarding(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showOnboarding])

  if (loading) return null
  if (!showOnboarding) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setShowOnboarding(false)}
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <OnboardingWizard onClose={() => setShowOnboarding(false)} ignoreSkip closeMode="dismiss" />
        </div>
      </div>
    </div>
  )
}
