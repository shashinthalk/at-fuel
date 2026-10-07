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

After every snapshot the collector also writes summaries per area (each entry in `collector/config.json`, plus "All areas") and fuel type:

| File | Contents |
| --- | --- |
| `public/history/daily.json` | Today: lowest / average / highest price, when and where the lowest was, and the 5 cheapest stations right now |
| `public/history/weeks/week-1.json` … `week-4.json` | This week and the 3 before (Mon–Sun): each day's prices and the day with the lowest price |
| `public/history/months.json` | Every month: the day with the lowest price, how much, and at which station |

They are rebuilt from `prices.json` on each run (`npm run history:rollup` does it on its own). Pick the area in the History view under "Lowest prices by day, week and month".

Without GitHub Actions, a local cron job does the same, e.g. every 30 minutes (`crontab -e`):

```cron
*/30 * * * * cd /path/to/fuel-app && /usr/local/bin/node collector/collect.mjs >> collector.log 2>&1
```

Once the site is on GitHub Pages, the GitHub Actions workflow records snapshots for you — don't also run the collector locally and commit its output, or the data commits will conflict.

### Optional: street-level photos

Copy `.env.example` to `.env` and set `VITE_MAPILLARY_TOKEN` (free client token from <https://www.mapillary.com/dashboard/developers>). For GitHub Pages, add it as a repository secret with the same name.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml`:

- builds and deploys the site on every push to `main`,
- records a price snapshot every 30 minutes, updates the daily / weekly / monthly summaries and commits them (so history keeps growing while your computer is off), then redeploys,
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

## Docker / Coolify

`.github/workflows/docker.yml` builds an image on every push to `main` (and on `v*` tags) and pushes it to `ghcr.io/shashinthalk/at-fuel` (`latest`, `sha-<commit>`, and the version for tags), for amd64 and arm64.

`docker-compose.yml` runs that image twice:

- **web**: nginx serving the site on port 80.
- **collector**: records a snapshot every 30 minutes and rebuilds `daily.json`, `weeks/` and `months.json`.

Both share the `history` volume. On first start it is filled with the history in the image, after that the container keeps recording on its own.

On Coolify: **New Resource → Docker Compose**, paste `docker-compose.yml` (or select this repository), set your domain on the `web` service with port 80, deploy. If the GitHub package is private, either make it public (GitHub → Packages → at-fuel → Package settings → Change visibility) or add `ghcr.io` credentials in Coolify (a personal access token with `read:packages`). To pick up a new image, redeploy in Coolify (or enable its webhook).

## Data sources

- Live prices: [E-Control](https://www.e-control.at) Spritpreisrechner API — by law only the cheapest stations in an area publish prices.
- National history: [European Commission – Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)
- Maps: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · Geocoding: Nominatim · Routing: OSRM
- Aerial imagery: Esri World Imagery (© Esri, Maxar, Earthstar Geographics)
