/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default nextConfig;
