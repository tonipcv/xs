// UI Labels and Constants for Organization Types
// This ensures consistent naming across the entire application

export const ORG_TYPE_LABELS = {
  SUPPLIER: 'AI Holder',
  CLIENT: 'AI Lab',
  PLATFORM_ADMIN: 'Platform Admin'
} as const;

export const ORG_TYPE_DESCRIPTIONS = {
  SUPPLIER: 'Data providers who supply voice datasets',
  CLIENT: 'AI companies who consume data for training',
  PLATFORM_ADMIN: 'Platform administrators'
} as const;

export const ORG_TYPE_ROUTES = {
  SUPPLIER: '/app/dashboard',
  CLIENT: '/app/dashboard',
  PLATFORM_ADMIN: '/admin',
} as const;

// Helper function to get label from organization type
export function getOrgTypeLabel(orgType: string | null | undefined): string {
  if (!orgType) return 'Unknown';
  return ORG_TYPE_LABELS[orgType as keyof typeof ORG_TYPE_LABELS] || orgType;
}

// Helper function to get description from organization type
export function getOrgTypeDescription(orgType: string | null | undefined): string {
  if (!orgType) return '';
  return ORG_TYPE_DESCRIPTIONS[orgType as keyof typeof ORG_TYPE_DESCRIPTIONS] || '';
}

// Helper function to get route from organization type
export function getOrgTypeRoute(orgType: string | null | undefined): string {
  if (!orgType) return '/app/dashboard';
  return ORG_TYPE_ROUTES[orgType as keyof typeof ORG_TYPE_ROUTES] || '/app/dashboard';
}
