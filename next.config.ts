import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
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
