# Deployment Guide (Recommended: Cloudflare Pages + Private GitHub Repo)

This repo is a static site (`index.html` + `assets/` + `images/`) and works well on Cloudflare Pages.

## Why switch from GitHub Pages to Cloudflare Pages?
- Easier DNS + TLS setup when your domain is on Cloudflare.
- Better edge caching and performance controls.
- Works with private repos through the Cloudflare GitHub integration.

## Migration plan

### 1) Make the GitHub repository private
1. GitHub -> repository `Settings` -> `General`.
2. Scroll to **Danger Zone** -> **Change repository visibility** -> **Make private**.

### 2) Disable GitHub Pages deployment in this repo
This repository no longer includes a GitHub Pages workflow or `CNAME` file.
If GitHub Pages was enabled before, disable it in:
- `Settings` -> `Pages` -> set Build and deployment source to **None**.

### 3) Create a Cloudflare Pages project
1. In Cloudflare dashboard: **Workers & Pages** -> **Create** -> **Pages**.
2. Connect to GitHub and pick this repository.
3. Use these build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `/`
4. Set production branch to `main`.

### 4) Attach your domain
1. In the Pages project, go to **Custom domains**.
2. Add your domain (for example `delphiodysseys.io`).
3. Let Cloudflare create/update the DNS records.
4. Ensure SSL mode is **Full (strict)**.

### 5) Optional: move heavy media to R2/CDN
If you outgrow repo-hosted media, host large video files on Cloudflare R2 and point the site to that URL using `site-config.js`.

## Local preview
You can test locally without build tooling:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
