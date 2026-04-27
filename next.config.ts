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
