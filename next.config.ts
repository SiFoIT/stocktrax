import type { NextConfig } from "next";

import { version } from "./package.json";

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
