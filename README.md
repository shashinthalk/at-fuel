# Spritpreis Austria — Fuel Price Explorer

Live Austrian fuel prices from the [E-Control Spritpreisrechner API](https://www.spritpreisrechner.at), with filters, maps, charts, price history, a "where should I fuel up?" calculator and next-week forecasts.

Built with React, TypeScript, Vite, Tailwind CSS, Leaflet, Recharts and TanStack Query.

## Features

- **Search** around any address, your location or a map click — or by federal state / district. "Wide" and "Extra wide" modes run several API queries to cover a larger area.
- **Filters**: fuel type, price, distance, brand, city, open now / 24/7, service type, payment methods, club card, favourites.
- **Views**: split map + list, cards, table, map, charts, history, compare.
- **Hover previews** with aerial images of each station (optional street-level photos via Mapillary).
- **History**: official weekly national prices since 2005 (EU Weekly Oil Bulletin), plus per-station history recorded by the collector — day-by-day view for the last 1–4 weeks, a week × weekday grid and a 7-day forecast of the cheapest day.
- **Compare**: pick 2–4 stations, enter consumption and budget, and see which one gives you the most fuel once the drive there is counted.

## Development

```bash
npm install --include=dev   # --include=dev matters if NODE_ENV=production is set in your shell
npm run dev                 # http://localhost:5173
npm run build               # production build in dist/
```

### Price history

The API only returns current prices, so history is recorded:

```bash
npm run collect                 # one snapshot of all areas in collector/config.json
npm run collect -- --watch 30   # keep recording every 30 minutes
npm run history:national        # refresh weekly national averages (EU Oil Bulletin)
```

Snapshots are stored in `public/history/prices.json` (only price *changes* are saved). Edit `collector/config.json` to choose which areas are recorded.

Once the site is on GitHub Pages, the GitHub Actions workflow records snapshots for you — don't also run the collector locally and commit its output, or the data commits will conflict.

### Optional: street-level photos

Copy `.env.example` to `.env` and set `VITE_MAPILLARY_TOKEN` (free client token from <https://www.mapillary.com/dashboard/developers>). For GitHub Pages, add it as a repository secret with the same name.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml`:

- builds and deploys the site on every push to `main`,
- records a price snapshot every 30 minutes and commits it (so history keeps growing while your computer is off), then redeploys,
- refreshes the national EU data every Tuesday.

Setup (once):

1. Create a new **public** repository on GitHub (e.g. `fuel-app`).
2. Push this project to its `main` branch.
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab, select the workflow and click **Run workflow** (or just push a commit).

The site will be at `https://<your-username>.github.io/<repository-name>/`.

Notes:

- GitHub may delay scheduled runs by several minutes, and pauses scheduled workflows in repositories with no activity for 60 days.
- Public repositories get unlimited Actions minutes. In a private repository, a run every 30 minutes uses roughly 2,000+ minutes a month — change the cron to hourly (`0 * * * *`) to stay within the free tier.
- After the workflow has committed data, run `git pull` before pushing your own changes.

## Data sources

- Live prices: [E-Control](https://www.e-control.at) Spritpreisrechner API — by law only the cheapest stations in an area publish prices.
- National history: [European Commission – Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)
- Maps: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · Geocoding: Nominatim · Routing: OSRM
- Aerial imagery: Esri World Imagery (© Esri, Maxar, Earthstar Geographics)
