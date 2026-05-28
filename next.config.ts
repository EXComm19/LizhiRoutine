import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.0.241",
    "100.68.231.43",
    // Tailscale Funnel host — public HTTPS that proxies to localhost:3000
    // so Health Auto Export on the phone can POST in. The hostname is
    // stable per machine (not the trycloudflare quick-tunnel kind that
    // changes every restart).
    "desktop-iaag6li.tailb73094.ts.net",
  ],
};

export default nextConfig;
