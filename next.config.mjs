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
    // Hard-block any dev endpoints in production just in case
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/api/dev/:path*',
          destination: '/404',
          permanent: false,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
