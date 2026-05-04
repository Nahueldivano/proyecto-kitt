import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // Node-only packages that webpack must NOT bundle.
  // pg/pgpass/pg-connection-string use fs/path/stream which break the client/edge bundle.
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
}

export default nextConfig
