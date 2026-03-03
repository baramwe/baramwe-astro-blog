// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [mdx(), react(), tailwind(), sitemap()],
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  vite: {
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '.prisma/client/index-browser': '.prisma/client/index-browser.js'
      }
    },
    ssr: {
      external: ['@prisma/client', '.prisma/client', 'better-sqlite3', 'path', 'fs']
    },
    optimizeDeps: {
      exclude: ['@prisma/client', '.prisma/client', 'better-sqlite3']
    },
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'path', 'fs']
      }
    }
  },
});
