import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native / large server-only packages: load from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@libsql/client", "libsql", "@huggingface/transformers", "onnxruntime-node", "unpdf"],
  // transformers.js loads onnxruntime-node via a runtime require the tracer can't see, so include it
  // explicitly — only the linux-x64 binary Vercel runs on (all platforms together are ~290MB > 250MB limit).
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*",
      "./node_modules/onnxruntime-common/**/*",
    ],
    "/api/ingest": ["./data/seed/**/*"],
  },
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/onnxruntime-web/**/*",
      "./node_modules/@huggingface/transformers/dist/*.web*",
      "./node_modules/@huggingface/transformers/dist/ort-wasm*",
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./.cache/**/*",
      "./data/*.db*",
    ],
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
