# Stratus

A lo-fi third-person browser flight game: fly a propeller plane through a PS1-ish neon dusk city, stay low, and avoid turning the aircraft into expensive confetti.

## Current prototype

- Vite + React + Three.js static app
- Third-person propeller plane
- Procedural low-poly cyberpunk city
- Arcade flight controls
- Collision with buildings / ground
- Survival score over time
- Cloudflare Pages-ready build output

## Controls

- `W` / `ArrowUp`: pitch up
- `S` / `ArrowDown`: pitch down
- `A` / `ArrowLeft`: turn left
- `D` / `ArrowRight`: turn right
- `Shift`: boost
- `Space`: brake
- Click game window: capture mouse for optional steering
- `R` or `Enter`: restart

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Cloudflare Pages

Use these settings when connecting the GitHub repo to Cloudflare Pages:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` if this repo only contains Stratus
- Deploy command: leave blank / unset
- Node version: Cloudflare default should work; use current LTS if Cloudflare asks

Do not use `npx wrangler deploy` for the Git-connected Pages build. That command targets Workers-style deployment and will fail unless Worker/assets config is added. No backend, Worker, or deploy command is required for the current prototype.

## GitHub setup handoff

After Justin creates the GitHub repo and grants push permission, add the remote from this folder:

```bash
git remote add origin <repo-url>
git branch -M main
git push -u origin main
```
