# clawdrop.live — Landing Page

Static landing page for clawdrop.live, hosted on piercalito VPS (72.62.239.63).

## Deploy
Files are served from `/var/www/clawdrop.live/` via nginx.

```bash
rsync -avz --delete ./ root@72.62.239.63:/var/www/clawdrop.live/ \
  --exclude README.md --exclude DESIGN.md --exclude screen.png
```
