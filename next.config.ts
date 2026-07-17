import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  output: "standalone",
  experimental: {
    // Brand profile pictures upload through a Server Action; the default body
    // limit is 1MB. Allow room for the 2MB image cap plus multipart overhead.
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
