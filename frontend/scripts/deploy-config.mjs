export function normalizeOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.port
  ) {
    throw new Error(
      "Provide an HTTPS API origin without credentials, a port, path, query, or fragment.",
    );
  }
  if (
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".invalid") ||
    url.hostname === "api.example.com" ||
    url.hostname === "localhost"
  ) {
    throw new Error("Provide the real public API hostname.");
  }
  return url.origin;
}

export function makeConfig(origin) {
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: "vite",
    buildCommand: "npm run build",
    outputDirectory: "dist",
    rewrites: [{ source: "/api/:path*", destination: `${origin}/:path*` }],
    headers: [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Vercel-CDN-Cache-Control", value: "no-store" },
          { key: "x-vercel-enable-rewrite-caching", value: "0" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ],
  };
}
