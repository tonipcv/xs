'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ArrowRight, Sparkles, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
// @ts-ignore - optional dependency
const confetti = typeof window !== 'undefined' ? require('canvas-confetti') : null

interface OnboardingStep {
  id: string
  title: string
  description: string
  benefit: string
  completed: boolean
  required: boolean
  dependencies?: string[]
  action?: () => void
  actionLabel?: string
}

interface OnboardingWizardProps {
  tenantId: string
  onComplete?: () => void
}

export function OnboardingWizard({ tenantId, onComplete }: OnboardingWizardProps) {
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 'profile',
      title: 'Complete Your Profile',
      description: 'Add company information and contact details',
      benefit: 'Helps buyers trust your datasets',
      completed: false,
      required: true,
      actionLabel: 'Complete Profile'
    },
    {
      id: 'cloud',
      title: 'Connect Cloud Storage',
      description: 'Link your AWS S3, GCP, or Azure storage',
      benefit: 'Enable instant dataset access without uploads',
      completed: false,
      required: true,
      dependencies: ['profile'],
      actionLabel: 'Connect Storage'
    },
    {
      id: 'dataset',
      title: 'Add Your First Dataset',
      description: 'Import audio data from your cloud storage',
      benefit: 'Start monetizing your data immediately',
      completed: false,
      required: true,
      dependencies: ['cloud'],
      actionLabel: 'Add Dataset'
    },
    {
      id: 'policy',
      title: 'Create Access Plan',
      description: 'Define pricing and access rules',
      benefit: 'Control who can access your data and how',
      completed: false,
      required: true,
      dependencies: ['dataset'],
      actionLabel: 'Create Plan'
    },
    {
      id: 'publish',
      title: 'Publish to Marketplace',
      description: 'Make your dataset discoverable',
      benefit: 'Reach AI labs looking for training data',
      completed: false,
      required: true,
      dependencies: ['policy'],
      actionLabel: 'Publish'
    }
  ])

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)

  useEffect(() => {
    // Load progress from API
    fetchProgress()
  }, [tenantId])

  const fetchProgress = async () => {
    try {
      const response = await fetch(`/api/v1/onboarding/${tenantId}/progress`)
      if (response.ok) {
        const data = await response.json()
        setSteps(prev => prev.map(step => ({
          ...step,
          completed: data.completedSteps?.includes(step.id) || false
        })))
      }
    } catch (error) {
      console.error('Failed to fetch onboarding progress:', error)
    }
  }

  const markStepComplete = async (stepId: string) => {
    try {
      await fetch(`/api/v1/onboarding/${tenantId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId })
      })

      setSteps(prev => prev.map(step =>
        step.id === stepId ? { ...step, completed: true } : step
      ))

      // Check if all steps completed
      const allCompleted = steps.every(s => s.id === stepId || s.completed)
      if (allCompleted) {
        triggerCelebration()
      }
    } catch (error) {
      console.error('Failed to mark step complete:', error)
    }
  }

  const triggerCelebration = () => {
    setShowCelebration(true)
    
    // Confetti animation
    const duration = 3000
    const end = Date.now() + duration

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#10b981', '#3b82f6', '#8b5cf6']
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#10b981', '#3b82f6', '#8b5cf6']
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }
    frame()

    setTimeout(() => {
      setShowCelebration(false)
      onComplete?.()
    }, duration)
  }

  const canAccessStep = (step: OnboardingStep) => {
    if (!step.dependencies) return true
    return step.dependencies.every(depId => 
      steps.find(s => s.id === depId)?.completed
    )
  }

  const completedCount = steps.filter(s => s.completed).length
  const progress = (completedCount / steps.length) * 100

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Welcome to XASE! 🚀</h1>
        <p className="text-muted-foreground">
          Let's get you set up to start monetizing your data
        </p>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Setup Progress</span>
              <span className="text-muted-foreground">
                {completedCount} of {steps.length} completed
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const isAccessible = canAccessStep(step)
          const isActive = index === currentStepIndex

          return (
            <Card
              key={step.id}
              className={`transition-all ${
                isActive ? 'ring-2 ring-primary' : ''
              } ${!isAccessible ? 'opacity-50' : ''}`}
            >
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {step.completed ? (
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{step.title}</CardTitle>
                      {step.required && (
                        <Badge variant="outline" className="text-xs">Required</Badge>
                      )}
                      {step.completed && (
                        <Badge variant="default" className="text-xs bg-green-500">
                          ✓ Done
                        </Badge>
                      )}
                    </div>
                    <CardDescription>{step.description}</CardDescription>

                    {/* Benefit Highlight */}
                    <Alert className="mt-3 bg-blue-50 border-blue-200">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-900">
                        <strong>Why this matters:</strong> {step.benefit}
                      </AlertDescription>
                    </Alert>

                    {/* Dependencies */}
                    {step.dependencies && !isAccessible && (
                      <Alert className="mt-3">
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Complete {step.dependencies.map(depId => 
                            steps.find(s => s.id === depId)?.title
                          ).join(', ')} first
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </CardHeader>

              {!step.completed && isAccessible && (
                <CardFooter>
                  <Button
                    onClick={() => {
                      step.action?.()
                      markStepComplete(step.id)
                    }}
                    className="w-full sm:w-auto"
                  >
                    {step.actionLabel || 'Complete Step'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardFooter>
              )}
            </Card>
          )
        })}
      </div>

      {/* Celebration Modal */}
      {showCelebration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md mx-4">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 text-6xl">🎉</div>
              <CardTitle className="text-2xl">Setup Complete!</CardTitle>
              <CardDescription>
                You're all set to start monetizing your data on XASE
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Your dataset is now live in the marketplace. AI labs can discover and request access to your data.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => window.location.href = '/xase/ai-holder/analytics'}>
                  View Analytics Dashboard
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/xase/ai-holder/datasets'}>
                  Manage Datasets
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
