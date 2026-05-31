# clawdrop.live — Landing Page

Static landing page for clawdrop.live, served via trial-frontend (Mac Mini, port 3000).

## Deploy
Landing page is now served via the trial-frontend PM2 process on the Mac Mini.
The Cloudflare Tunnel routes clawdrop.live/ → http://localhost:3000.

If you need to sync static files directly to a remote host:
```bash
# Set DEPLOY_HOST to the target (e.g. 100.69.110.94 for Mac Mini Tailscale)
rsync -avz --delete ./ ${DEPLOY_HOST:-luisploennig@localhost}:/path/to/static/ \
  --exclude README.md --exclude DESIGN.md --exclude screen.png
```
