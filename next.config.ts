import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // playwright-core and @sparticuz/chromium do dynamic, non-static file
  // lookups internally (e.g. playwright-core reads browsers.json at
  // runtime rather than importing it). Next's bundler can't trace those,
  // so if it tries to bundle these packages, files like browsers.json get
  // silently dropped from the deployed function and it crashes with
  // "Cannot find module .../browsers.json" in production. Marking them
  // external keeps them as plain node_modules requires at runtime instead.
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],

  // Belt-and-suspenders: also explicitly include the sparticuz Chromium
  // binary in the traced output for this route, in case tracing still
  // misses it even with the package marked external.
  outputFileTracingIncludes: {
    '/api/scrape': [
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/playwright-core/**',
    ],
  },
};

export default nextConfig;