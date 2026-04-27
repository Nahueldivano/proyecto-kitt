import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep Prisma and pg as external modules — they can't be bundled by webpack
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "pg-pool"],
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
