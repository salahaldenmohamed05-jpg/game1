/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // NOTE: i18n removed — app is Arabic-only, RTL set via _document.js
  // Keeping locales caused prerender errors with <Html> import.
  // NOTE: Do NOT set NEXT_PUBLIC_API_URL here — runtime detection in api.js handles it.
  // Hardcoding URLs breaks sandbox environments where URLs change per session.
  // Disable x-powered-by header
  poweredByHeader: false,
  // Compress responses
  compress: true,
};

module.exports = nextConfig;
