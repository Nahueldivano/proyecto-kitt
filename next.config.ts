import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-pool",
    "pg-connection-string",
    "pgpass",
    "pg-native",
    "googleapis",
    "googleapis-common",
    "gaxios",
    "gcp-metadata",
    "google-auth-library",
    "https-proxy-agent",
    "agent-base",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // Asegurar que los assets estáticos se sirven con headers correctos
  // para evitar problemas con proxies reversos (Traefik/nginx en Easypanel)
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/public/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ]
  },
}

export default nextConfig
