import type { NextConfig } from "next";

// Every page in Éclaira handles health data or a signed-in clinic session,
// so nothing is cached or statically prerendered: all routes are dynamic.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  // Treat every user agent as an HTML-limited bot, so metadata blocks rendering
  // and <title> is always in <head>. Streamed metadata (the default) lands in
  // <body> once generateMetadata resolves, which left the patient page untitled
  // for a moment after the identity check. No page flushes anything before its
  // data is loaded, so blocking costs no measurable TTFB.
  htmlLimitedBots: /.*/,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
