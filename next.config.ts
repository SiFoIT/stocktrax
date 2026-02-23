import type { NextConfig } from "next";

const { version } = require("./package.json");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.parqet.com",
        pathname: "/logos/**",
      },
    ],
  },
};

export default nextConfig;
