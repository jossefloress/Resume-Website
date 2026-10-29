# josedevlabs.com

Personal site for Jose Israel Flores. Plain HTML, one stylesheet, a few lines of JavaScript. No framework,
no build step, no webfonts. Served by GitHub Pages from `main` (custom domain in `CNAME`).

## Layout

| Path | What it is |
|---|---|
| `index.html` | The site: intro, selected work, experience, skills, education. |
| `css/site.css` | All styles. Light and dark mode follow the visitor's system setting. |
| `js/site.js` | Plays each demo video only while it is on screen; shows the poster and controls instead for visitors who prefer reduced motion. |
| `media/` | Demo recordings (WebM first, MP4 fallback, JPG poster) and the PlanDrop icon. |
| `documents/JoseFlores.pdf` | Resume linked from the intro. |
| `medtracker/` | MedTracker, a standalone app. |
| `plandrop/` | PlanDrop privacy policy and terms pages. |
| `sw.js` | Retired service worker. It clears the caches registered by a July 2026 redesign and unregisters itself. Safe to delete after early 2027. |

## Demo videos

Recorded with Playwright against the live apps (WorkoutDrop in its offline mode, MedTracker in demo mode),
so no personal or account data appears. Encoded with ffmpeg: H.264 MP4 with `+faststart` and VP9 WebM,
muted, 390 x 844. Embedded as `<video muted loop playsinline>` instead of GIFs, which are several times larger.
