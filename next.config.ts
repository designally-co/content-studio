import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  output: "standalone",
  /*
   * THIS DIRECTORY IS THE WORKSPACE, and saying so is not housekeeping.
   *
   * Turbopack infers the root by walking up for lockfiles, and a stray
   * `package-lock.json` in the HOME directory outranks this project's own — so
   * the root resolved to `/Users/admin`, `drizzle-orm` stopped resolving, and
   * `next dev` accepted connections while never answering one. A dev server
   * that hangs instead of erroring is the expensive kind of broken: it looks
   * like a slow compile for as long as you are willing to wait.
   */
  turbopack: { root: path.resolve(process.cwd()) },
  experimental: {
    // Brand profile pictures upload through a Server Action; the default body
    // limit is 1MB. Allow room for the 2MB image cap plus multipart overhead.
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
