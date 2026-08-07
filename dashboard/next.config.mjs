/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Make API URL available to server components via env at build time
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL:  process.env.NEXT_PUBLIC_WS_URL,
  },
}

export default nextConfig
