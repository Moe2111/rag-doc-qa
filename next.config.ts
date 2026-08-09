import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships a PDF engine that loads worker files at runtime; bundling
  // it breaks those paths, so load it from node_modules instead.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
