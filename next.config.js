/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow server-side code to use Node.js built-ins like fs, child_process
  experimental: {
    serverComponentsExternalPackages: ['chokidar', 'google-spreadsheet', 'google-auth-library'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle server-only modules for the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
