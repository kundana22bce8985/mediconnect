/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/mediconnect",
  assetPrefix: "/mediconnect",
  trailingSlash: true,

  images: {
    unoptimized: true,
  },
};

export default nextConfig;