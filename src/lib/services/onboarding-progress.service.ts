// @ts-nocheck
import { prisma } from '@/lib/prisma';

export interface OnboardingStep {
  roleSelected: boolean;
  integrationSetup: boolean;
  firstDatasetAdded: boolean;
  firstPolicyCreated: boolean;
  firstLeaseIssued: boolean;
}

export class OnboardingProgressService {
  async getProgress(tenantId: string) {
    let progress = await prisma.onboardingProgress.findUnique({
      where: { tenantId },
    });

    if (!progress) {
      progress = await prisma.onboardingProgress.create({
        data: {
          tenantId,
          roleSelected: false,
          integrationSetup: false,
          firstDatasetAdded: false,
          firstPolicyCreated: false,
          firstLeaseIssued: false,
          currentStep: 1,
        },
      });
    }

    return progress;
  }

  async updateStep(tenantId: string, step: Partial<OnboardingStep>) {
    const progress = await this.getProgress(tenantId);
    
    const updatedProgress = await prisma.onboardingProgress.update({
      where: { tenantId },
      data: {
        ...step,
        currentStep: this.calculateCurrentStep({ ...progress, ...step }),
        updatedAt: new Date(),
      },
    });

    if (this.isCompleted(updatedProgress)) {
      await prisma.onboardingProgress.update({
        where: { tenantId },
        data: { completedAt: new Date() },
      });
    }

    return updatedProgress;
  }

  async markRoleSelected(tenantId: string) {
    return this.updateStep(tenantId, { roleSelected: true });
  }

  async markIntegrationSetup(tenantId: string) {
    return this.updateStep(tenantId, { integrationSetup: true });
  }

  async markFirstDatasetAdded(tenantId: string) {
    return this.updateStep(tenantId, { firstDatasetAdded: true });
  }

  async markFirstPolicyCreated(tenantId: string) {
    return this.updateStep(tenantId, { firstPolicyCreated: true });
  }

  async markFirstLeaseIssued(tenantId: string) {
    return this.updateStep(tenantId, { firstLeaseIssued: true });
  }

  async skipOnboarding(tenantId: string) {
    return await prisma.onboardingProgress.update({
      where: { tenantId },
      data: {
        skippedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private calculateCurrentStep(progress: OnboardingStep): number {
    if (!progress.roleSelected) return 1;
    if (!progress.integrationSetup) return 2;
    if (!progress.firstDatasetAdded) return 3;
    if (!progress.firstPolicyCreated) return 4;
    if (!progress.firstLeaseIssued) return 5;
    return 6;
  }

  private isCompleted(progress: any): boolean {
    return (
      progress.roleSelected &&
      progress.integrationSetup &&
      progress.firstDatasetAdded &&
      progress.firstPolicyCreated &&
      progress.firstLeaseIssued
    );
  }

  async getCompletionPercentage(tenantId: string): Promise<number> {
    const progress = await this.getProgress(tenantId);
    
    const steps = [
      progress.roleSelected,
      progress.integrationSetup,
      progress.firstDatasetAdded,
      progress.firstPolicyCreated,
      progress.firstLeaseIssued,
    ];

    const completedSteps = steps.filter(Boolean).length;
    return Math.round((completedSteps / steps.length) * 100);
  }
}

export const onboardingProgressService = new OnboardingProgressService();
