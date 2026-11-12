# Server copies from vps, retired 2026-11-12

These apps ran on vps (srv1313715) as plain copies, outside git. They were retired on 2026-11-12
after a traffic audit showed no genuine use. The copies here hold file versions that exist nowhere
else in this repo's history, so they are archived as they ran. This folder is a record, not
something to build or deploy: the current code for each package lives in `packages/`.

| Folder | Ran from | Served | Compared with |
|---|---|---|---|
| `vpn-x402/` | `/opt/vpn-x402` | vpn.hfsp.cloud | not in `packages/` (closest: `packages/clawdrop-vpn`) |
| `x402-store/` | `/opt/x402-store` | store.hfsp.cloud | `packages/x402-store` |
| `x402-xstocks-feed/` | `/opt/x402-xstocks-feed` | feed.xstocks.hfsp.cloud | `packages/x402-xstocks-feed` |
| `gnosis-card-x402/` | `/opt/hfsp-labs/packages/gnosis-card-x402` | clawdrop.live/gnosis-api | `packages/gnosis-card-x402` |
| `srv-colosseum/` | uncommitted files in the `/srv/colosseum` checkout (at e3fa19c) | the trial compose stack and the x402-demo app | `docker-compose.trial.yml`, `packages/x402-demo`, `packages/x402-sdk` |

Left out:
- `node_modules`, `dist` and lock files
- every `.env` file
- databases and logs

The Helius API key that `srv-colosseum/docker-compose.trial.yml` had inline is replaced with
`${HELIUS_API_KEY}`. The full server backup, `.env` files included, is kept offline by the owner.
