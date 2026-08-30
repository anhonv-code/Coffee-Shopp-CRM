/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma & bcrypt must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  eslint: {
    // Lint is run separately via `npm run lint`; don't fail production builds
    // on style-only issues.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
