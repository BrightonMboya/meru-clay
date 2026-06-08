# Meru Clay

Landing page for **Meru Clay** — Tanzania's first true clay tennis club, at the foot of Mount Meru in Arusha. Converted from the Paper design mockup into a production site.

## Stack

- **[Astro](https://astro.build)** — static site framework (zero JS shipped by default)
- **[Tailwind CSS v4](https://tailwindcss.com)** — styling, via the `@tailwindcss/vite` plugin
- **Fonts** — [Fraunces](https://fonts.google.com/specimen/Fraunces) (display) + [Archivo](https://fonts.google.com/specimen/Archivo) (sans), served from Google Fonts
- **Hosting** — [Cloudflare Pages](https://pages.cloudflare.com) (static)

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
```

## Build

```bash
npm run build      # outputs to ./dist
npm run preview    # serve the production build locally
```

## Deploy to Cloudflare Pages

**Option A — Git integration (recommended)**

Connect this repo in the Cloudflare dashboard → Pages → *Create project*, then set:

- **Framework preset:** Astro
- **Build command:** `npm run build`
- **Build output directory:** `dist`

Every push to the production branch builds and deploys automatically.

**Option B — Direct upload with Wrangler**

```bash
npm run build
npx wrangler pages deploy        # uses pages_build_output_dir from wrangler.toml
```

## Structure

```
src/
  layouts/Layout.astro      # <head>, fonts, meta
  pages/index.astro         # assembles the page
  components/               # one file per section
    Hero · About · Courts · Pricing · Team · Visit · Cta · Footer
  styles/global.css         # Tailwind import + brand theme tokens
public/images/              # hero, court, and CTA photography
```

The brand palette and type scale live as `@theme` tokens in `src/styles/global.css`
(`pine`, `clay`, `clay-light`, `cream`, `mist`, plus the `display`/`sans` font families).
