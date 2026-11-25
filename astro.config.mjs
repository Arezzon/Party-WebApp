// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  // Origin is enforced in src/middleware.ts (400 on mismatch), including
  // behind reverse proxies/tunnels where Astro cannot see the public origin.
  security: {
    checkOrigin: false
  },

  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()]
  }
});
