# Éclaira website

Static marketing site for Éclaira (French, self-hosted fonts, no trackers), deployed on Cloudflare Pages.

```bash
python3 build.py                      # builds dist/ (BASE defaults to https://eclaira.pages.dev)
BASE=https://eclaira.health CONTACT=contact@eclaira.health python3 build.py
python3 -m http.server 4173 --directory dist
```

**Cloudflare Pages settings:** root directory `website`, build command `python3 build.py`, output directory `dist`, environment variables `BASE` (the site's final URL) and `CONTACT`.

- `pages/` holds the pages. Each starts with a TITLE / DESC / PATH comment and shares `_head`, `_header`, `_footer`. The build checks title and description lengths, validates JSON-LD, and writes `sitemap.xml`, `robots.txt`, `site.webmanifest` and `_headers` (CSP, caching).
- `video/explainer.html` is the source of the hero film: an HTML/SVG animation driven by `render(t)`. Edit the scenes there, never the MP4. `npm run video:preview` renders keyframes; `npm run video:frames` renders all frames, then encode:

```bash
ffmpeg -framerate 30 -i video/frames/f%05d.png -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart -tune animation site/assets/video/eclaira-explainer.mp4
ffmpeg -framerate 30 -i video/frames/f%05d.png -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -pix_fmt yuv420p site/assets/video/eclaira-explainer.webm
```

QA at last build: Lighthouse 96–100 on all four categories (home and inner pages, mobile and desktop), axe clean (WCAG 2.2 AA + best practices) on every page in light and dark, at 1440 px and 390 px.
