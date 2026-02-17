import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'private-next-instrumentation-client': path.resolve(
        process.cwd(),
        'src/empty-instrumentation-client.ts'
      ),
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/push/onesignal/:path*',
        destination: '/api/push/onesignal/:path*',
      },
    ];
  },
  async redirects() {
    // OLD ROUTE REDIRECTS - redirect legacy URLs to new /app/* structure
    const legacyRedirects = [
      // AI Holder (supplier) -> /app/*
      { source: '/xase/ai-holder', destination: '/app/dashboard', permanent: true },
      { source: '/xase/ai-holder/datasets', destination: '/app/datasets', permanent: true },
      { source: '/xase/ai-holder/datasets/new', destination: '/app/datasets/new', permanent: true },
      { source: '/xase/ai-holder/datasets/:id', destination: '/app/datasets/:id', permanent: true },
      { source: '/xase/ai-holder/datasets/:id/upload', destination: '/app/datasets/:id/upload', permanent: true },
      { source: '/xase/ai-holder/datasets/:id/stream', destination: '/app/datasets/:id/preview', permanent: true },
      { source: '/xase/ai-holder/datasets/:id/lab', destination: '/app/datasets/:id/lab', permanent: true },
      { source: '/xase/ai-holder/datasets/browse', destination: '/app/datasets', permanent: true },
      { source: '/xase/ai-holder/policies', destination: '/app/policies', permanent: true },
      { source: '/xase/ai-holder/policies/new', destination: '/app/policies/new', permanent: true },
      { source: '/xase/ai-holder/policies/:id/test', destination: '/app/policies/:id/test', permanent: true },
      { source: '/xase/ai-holder/policies/:id/rewrite-rules', destination: '/app/policies/:id/rewrite-rules', permanent: true },
      { source: '/xase/ai-holder/leases', destination: '/app/leases', permanent: true },
      { source: '/xase/ai-holder/ledger', destination: '/app/billing', permanent: true },
      { source: '/xase/ai-holder/offers/new', destination: '/app/marketplace/publish', permanent: true },
      { source: '/xase/ai-holder/access-logs', destination: '/app/audit', permanent: true },
      
      // AI Lab (client) -> /app/*
      { source: '/xase/ai-lab', destination: '/app/dashboard', permanent: true },
      { source: '/xase/ai-lab/training', destination: '/app/training', permanent: true },
      { source: '/xase/ai-lab/billing', destination: '/app/billing', permanent: true },
      { source: '/xase/ai-lab/marketplace', destination: '/app/marketplace', permanent: true },
      { source: '/xase/ai-lab/usage', destination: '/app/billing', permanent: true },
      { source: '/xase/ai-lab/webhooks', destination: '/app/settings/webhooks', permanent: true },
      
      // Governed Access (marketplace) -> /app/marketplace
      { source: '/xase/governed-access', destination: '/app/marketplace', permanent: true },
      { source: '/xase/governed-access/:offerId', destination: '/app/marketplace/:offerId', permanent: true },
      
      // Other shared routes
      { source: '/xase/bundles', destination: '/app/evidence', permanent: true },
      { source: '/xase/bundles/:id', destination: '/app/evidence', permanent: true },
      { source: '/xase/training/leases/:leaseId', destination: '/app/training/:leaseId', permanent: true },
      { source: '/xase/training/request-lease', destination: '/app/training', permanent: true },
      { source: '/xase/sidecar', destination: '/app/training/sidecar', permanent: true },
      { source: '/xase/executions/:id', destination: '/app/audit', permanent: true },
      { source: '/xase/records', destination: '/app/audit', permanent: true },
      { source: '/xase/cli/verify', destination: '/app/cli/verify', permanent: true },
      
      // Data Holder specific
      { source: '/xase/data-holder/connectors', destination: '/app/datasets/browse', permanent: true },
      { source: '/xase/data-holder/gcp-project-picker', destination: '/app/datasets/browse', permanent: true },
    ];

    // Hard-block any dev endpoints in production just in case
    if (process.env.NODE_ENV === 'production') {
      return [
        ...legacyRedirects,
        {
          source: '/api/dev/:path*',
          destination: '/404',
          permanent: false,
        },
      ];
    }
    return legacyRedirects;
  },
};

export default nextConfig;
