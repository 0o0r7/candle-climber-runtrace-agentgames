# Deployment

Production target for this build is **Vercel**, on its own dedicated project and address. The app is a standard Next.js 16 App Router application; `next.config.ts` already disables `output: "standalone"` when `VERCEL` is set, so no build configuration change is required.

## Environment variables

Set these in the Vercel project (Settings → Environment Variables). Nothing else is required to boot.

| Variable | Required | Purpose |
| --- | --- | --- |
| `RUN_TOKEN_SECRET` | **Yes in production** | HMAC key for run tokens used by leaderboard submissions. Production fails closed without it. Generate with `openssl rand -hex 32`. |
| `DATABASE_URL` | No | MongoDB URI (`mongodb://` / `mongodb+srv://`). Without it, leaderboard / duels / ghosts / weights fall back to in-memory stores that reset on restart. |
| `SENTRY_AUTH_TOKEN` | No | Source-map upload only. The build passes without it. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Error reporting. |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical site URL used for `metadataBase` and absolute links. Set it to the deployed address. |

`NODE_ENV` is set by the platform. Do not commit any secret value.

## Deploy

1. Create a new Vercel project from this repository, with the branch containing this build as the production branch.
2. Framework preset: **Next.js**. Install and build commands are pinned in `vercel.json`:
   - install: `bun install --frozen-lockfile`
   - build: `node node_modules/next/dist/bin/next build`

   The build command must run under Node, not the Bun runtime. `bun run build` compiles and type-checks cleanly but fails while prerendering `/_global-error` with `TypeError: null is not an object (evaluating 'P.H.useContext')`; the identical tree builds every route successfully under Node 22. Keep the Node invocation.
3. Add the environment variables above for the Production environment.
4. Deploy, then verify.

## Verify a deployment

```sh
BASE=https://<deployment-host>

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"            # 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/runproof"    # 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/play"        # 200
```

Endpoint checks:

```sh
# a valid trace must return a decision, not an error
curl -s -X POST "$BASE/api/runproof/verify" \
  -H 'content-type: application/json' \
  --data @<valid-trace.json> | head -c 400

# an oversized body must be refused
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/runproof/verify" \
  -H 'content-type: application/json' --data-binary @<(head -c 2100000 /dev/zero | tr '\0' 'a')

# receipts list answers (store: memory | mongo)
curl -s "$BASE/api/runproof/runs?limit=5"
```

The run console at `/runproof` also exercises the endpoints in the browser: finish a run, press "Replay-check" (ACCEPT), "Save receipt" (opens `/runproof/r/{id}`), then "Tamper my run (+1 score)" and confirm it returns `FLAG`.

## Notes

- The in-memory fallback stores mean leaderboard data does not persist across deployments or cold starts unless `DATABASE_URL` is set.
- Request controls on the verification endpoint are process-local. On a serverless platform each instance enforces them independently; do not present them as distributed rate limiting.
- The address is public once deployed. Everything in this repository becomes public with it, so review the tree before flipping visibility.
