import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Workaround for Next.js requiring a virtual module
    // 'private-next-instrumentation-client' in some setups.
    // We alias it to a no-op local module.
    config.resolve = config.resolve || {} as any;
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'private-next-instrumentation-client': path.resolve(
        __dirname,
        'src/empty-instrumentation-client.ts'
      ),
    } as any;
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
};

export default nextConfig;
