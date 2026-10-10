import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  // Die Web-App spricht die API über denselben Ursprung an (Cookies, kein CORS).
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  // Codespaces leitet Ports über eigene Domains weiter
  allowedDevOrigins: ['*.app.github.dev', 'localhost', '127.0.0.1'],
};

export default nextConfig;
