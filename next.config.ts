import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships a PDF engine that loads worker/native files at runtime.
  // Bundling it breaks those paths, so load it from node_modules instead.
  serverExternalPackages: ["pdf-parse"],

  // pdfjs-dist pulls in @napi-rs/canvas via a dynamic require() inside a
  // try/catch — invisible to the file tracer, so it never gets deployed and
  // DOMMatrix ends up undefined at runtime. Force it into the ingest bundle.
  outputFileTracingIncludes: {
    "/api/ingest": ["./node_modules/@napi-rs/canvas/**/*"],
  },
};

export default nextConfig;
