// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// NOTE: update `site` to the real production domain before launch —
// canonical URLs, Open Graph tags, robots.txt and the sitemap all derive from it.
// https://astro.build/config
export default defineConfig({
  site: 'https://meruclay.com',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
