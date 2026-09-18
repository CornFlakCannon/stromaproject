import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The site is served from GitHub Pages: no server, so the build is a static
     export into out/ and next/image hands the files over as they are — which is
     why everything under public/ is already cut to a web size. See DEPLOY.md. */
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
