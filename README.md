# OpenEngine AEO Scanner

A free AEO (Answer Engine Optimization) scanner built with Next.js. Score how visible your site is to AI with a 26-point scan covering security, meta tags, structure, mobile, accessibility, social, schema, AI mode, generative UI, trust, agent ecosystem, performance, links, sitemap, and more.

## Features

- 26-point AEO scan with multi-page crawl (up to 8 pages)
- Speed audit (TTFB, HTML size, render-blocking resources)
- Broken-link checker
- Social previews (Google, Facebook/LinkedIn, X/Twitter)
- Competitor side-by-side comparison
- Score history per host
- Downloadable Markdown report

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — run ESLint

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS 4
- TypeScript
- node-html-parser
