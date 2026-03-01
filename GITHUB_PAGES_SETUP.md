# GitHub Pages + Custom Domain Setup

## What is already prepared
- Static site entrypoint: `index.html`
- Jekyll disabled for clean static serving: `.nojekyll`
- Safe default video path in page code: `./assets/odyssey.mp4`
- Large local media excluded from git: `.gitignore`
- Custom domain template: `CNAME.example`

## 1) Create repo and push
1. Create a new GitHub repo (public or private with Pages support).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial Delphi Odysseys site"
   git branch -M main
   git remote add origin <YOUR_REPO_URL>
   git push -u origin main
   ```

## 2) Enable GitHub Pages (free)
1. On GitHub: `Settings` -> `Pages`.
2. Under `Build and deployment`:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
3. Save.

Your site will publish at:
- `https://<username>.github.io/<repo>/` (project page)

## 3) Connect external domain
1. Create a `CNAME` file in repo root with only your domain, for example:
   ```
   odysseys.yourdomain.com
   ```
2. Commit and push `CNAME`.
3. Add DNS records at your domain registrar:
   - For subdomain (recommended): `CNAME` record
     - Host: `odysseys`
     - Value: `<username>.github.io`
   - For apex/root domain (`yourdomain.com`): use `A` records to GitHub Pages IPs.
4. Back in GitHub Pages settings, verify custom domain and enable `Enforce HTTPS`.

## 4) Optional: use externally hosted video URL
If you host the MP4 on a CDN/storage bucket:
1. Copy `site-config.example.js` -> `site-config.js`
2. Set:
   ```js
   window.ODYSSEY_VIDEO_URL = "https://cdn.yourdomain.com/odyssey.mp4";
   ```
3. In `index.html`, include before the main inline script:
   ```html
   <script src="site-config.js"></script>
   ```

## Notes
- GitHub blocks files >100MB from normal git push. Keep heavy masters outside the repo.
- Current default `assets/odyssey.mp4` is included in the repo and used on Pages.
