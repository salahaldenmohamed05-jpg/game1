/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // NOTE: i18n removed — app is Arabic-only, RTL set via _document.js
  // NOTE: Do NOT set NEXT_PUBLIC_API_URL here — runtime detection in api.js handles it.
  
  // Disable x-powered-by header
  poweredByHeader: false,
  
  // Compress responses
  compress: true,

  // ── Production Optimizations ──────────────────────────────────────────
  
  // SWC minification (faster than Terser)
  swcMinify: true,
  
  // Image optimization
  images: {
    // Allow optimized images from any domain
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
    // Use modern formats (AVIF is ~50% smaller than WebP)
    formats: ['image/avif', 'image/webp'],
    // Aggressive caching
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Compiler optimizations
  compiler: {
    // Remove console.log in production (keep error/warn)
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  
  // Experimental features for performance
  experimental: {
    // Optimize package imports — tree-shake heavy libraries
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      'date-fns',
      '@tanstack/react-query',
      '@headlessui/react',
      'react-hot-toast',
    ],
  },
  
  // Webpack optimizations
  webpack: (config, { isServer, dev }) => {
    // Production-only optimizations
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        // Minimize bundle size
        minimize: true,
        splitChunks: {
          ...config.optimization.splitChunks,
          chunks: 'all',
          maxAsyncRequests: 8,
          maxInitialRequests: 6,
          cacheGroups: {
            ...config.optimization.splitChunks?.cacheGroups,
            // Separate core framework (loaded on every page)
            framework: {
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              name: 'framework',
              chunks: 'all',
              priority: 40,
              enforce: true,
            },
            // Separate animation library (heavy, can be deferred)
            animation: {
              test: /[\\/]node_modules[\\/](framer-motion)[\\/]/,
              name: 'vendor-animation',
              chunks: 'all',
              priority: 30,
            },
            // Separate chart library (only used in analytics)
            charts: {
              test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
              name: 'vendor-charts',
              chunks: 'all',
              priority: 25,
            },
            // Separate data layer
            data: {
              test: /[\\/]node_modules[\\/](@tanstack|axios|socket\.io-client|zustand)[\\/]/,
              name: 'vendor-data',
              chunks: 'all',
              priority: 20,
            },
            // Common code shared across 2+ pages
            common: {
              minChunks: 2,
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    
    // Ignore optional dependencies that may not exist
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
  
  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Cache static assets aggressively (1 year + immutable)
        source: '/(.*)\\.(ico|svg|png|jpg|jpeg|gif|webp|avif|woff|woff2|ttf|eot)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Cache JS/CSS chunks (Next.js adds content hash to filenames)
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Service worker: always revalidate
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Manifest: short cache
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
