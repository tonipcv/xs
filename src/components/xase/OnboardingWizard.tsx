'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, ArrowRight, X } from 'lucide-react';

interface OnboardingProgress {
  roleSelected: boolean;
  integrationSetup: boolean;
  firstDatasetAdded: boolean;
  firstPolicyCreated: boolean;
  firstLeaseIssued: boolean;
  currentStep: number;
  completedAt?: string;
  skippedAt?: string;
}

const ONBOARDING_STEPS = [
  {
    id: 'roleSelected',
    title: 'Select Your Role',
    description: 'Choose whether you are a Data Holder or AI Lab',
    action: 'Go to Settings',
    link: '/settings',
  },
  {
    id: 'integrationSetup',
    title: 'Connect Your Data Source',
    description: 'Set up OAuth integration with your cloud storage',
    action: 'Connect Integration',
    link: '/app/datasets/browse',
  },
  {
    id: 'firstDatasetAdded',
    title: 'Add Your First Dataset',
    description: 'Upload or connect your first voice dataset',
    action: 'Add Dataset',
    link: '/app/datasets',
  },
  {
    id: 'firstPolicyCreated',
    title: 'Create Access Policy',
    description: 'Define who can access your data and under what terms',
    action: 'Create Policy',
    link: '/app/policies',
  },
  {
    id: 'firstLeaseIssued',
    title: 'Issue First Lease',
    description: 'Grant time-limited access to your data',
    action: 'Issue Lease',
    link: '/app/leases',
  },
];

export function OnboardingWizard({ onClose, ignoreSkip, closeMode = 'skip' }: { onClose?: () => void; ignoreSkip?: boolean; closeMode?: 'skip' | 'dismiss' }) {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/onboarding/progress');
      if (!response.ok) throw new Error('Failed to fetch progress');
      const data = await response.json();
      setProgress(data.progress);
      setPercentage(data.percentage);
    } catch (error) {
      console.error('Failed to fetch onboarding progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      await fetch('/api/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      });
      onClose?.();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
  };

  if (loading || !progress) {
    return null;
  }

  if (progress.completedAt || (progress.skippedAt && !ignoreSkip)) {
    return null;
  }

  return (
    <Card className="border border-gray-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base text-gray-900">Welcome to XASE</CardTitle>
            <CardDescription className="mt-1 text-gray-600">
              Set up in a few simple steps
            </CardDescription>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-500 hover:text-gray-900"
              onClick={closeMode === 'dismiss' ? onClose : handleSkip}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">Progress</span>
            <span className="text-xs text-gray-600">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-1.5" />
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-2.5">
          {ONBOARDING_STEPS.map((step, index) => {
            const isCompleted = progress[step.id as keyof OnboardingProgress] === true;
            const isCurrent = progress.currentStep === index + 1;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                  isCurrent
                    ? 'border-gray-300 bg-gray-50'
                    : isCompleted
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-gray-700" />
                  ) : (
                    <Circle
                      className={`w-5 h-5 ${
                        isCurrent ? 'text-gray-700' : 'text-gray-300'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">{step.title}</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {step.description}
                  </div>
                </div>
                {!isCompleted && isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => (window.location.href = step.link)}
                    className="flex-shrink-0 border-gray-300 text-gray-900 hover:bg-gray-100"
                  >
                    {step.action}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t flex justify-between items-center">
          <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900" onClick={handleSkip}>
            Skip for now
          </Button>
          <div className="text-xs text-gray-500">
            Step {progress.currentStep} of {ONBOARDING_STEPS.length}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
