# خدمني | Khadimni

A mobile-style Arabic job platform for connecting workers and employers in Algeria. Runs as a phone-frame web app with RTL layout, full navigation, and 20+ screens.

## Run & Operate

- `pnpm --filter @workspace/khadimni run dev` — run the front-end app (served at `/`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (served at `/api`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: Vanilla JS + Vite (no framework)
- Icons: Lucide (CDN UMD build)
- CSS: Custom properties, no build-time Tailwind (CDN only)
- API: Express 5 (scaffolded, not yet used by front-end)
- DB: PostgreSQL + Drizzle ORM (scaffolded, not yet used)

## Where things live

- `artifacts/khadimni/index.html` — HTML shell (RTL, Arabic lang, CDN links)
- `artifacts/khadimni/style.css` — all CSS custom properties and component styles
- `artifacts/khadimni/script.js` — full app: data, state, screens, router, render loop
- `artifacts/api-server/src/` — Express backend (currently unused by the front-end)
- `lib/api-spec/openapi.yaml` — API contract (health check only, not yet extended)

## Architecture decisions

- Single-page vanilla JS app rendered into `#screen-root` via `innerHTML` — mirrors component structure for easy React migration
- Router is `go(screen, payload)` / `back()` backed by a `STATE.history` stack
- All data is in-memory mock data in `script.js`; no API calls yet
- Lucide icons are `<i data-lucide="...">` tags reprocessed by `lucide.createIcons()` after each render
- Script loaded as a plain `<script>` (not `type="module"`) so all functions are global and accessible from inline `onclick` handlers

## Product

- **Splash → Welcome → Auth flow** (account type, signup, OTP, login)
- **Home** with categories grid, job listings, and available workers carousel
- **Search** with tab filters (all / jobs / workers / services) and filter sheet
- **Results** — worker cards with chat/call CTAs
- **Worker profile** — bio, skills, portfolio, stats, favorite toggle
- **Nearby** — map-style worker pin view
- **Messages** — chat list → full chat → voice call screen
- **Post menu** — publish job or service forms
- **Notifications** — filterable notification feed
- **AI assistant** — chat interface with canned responses
- **Profile** — favorites, activity log, ratings, settings, edit profile, support

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `script.js` uses string concatenation (not template literals) for HTML generation to avoid `onclick` attribute quoting issues
- `lucide.createIcons()` must be called after every `render()` since the DOM is fully replaced each time
- The Vite dev server serves `style.css` and `script.js` as static files from the artifact root — no import/bundling of these files
- `STATE.dark` flips in settings but dark-mode CSS variables are not yet implemented (proposed as a follow-up task)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
