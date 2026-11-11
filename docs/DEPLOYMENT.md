# Deployment

The app builds to a static bundle (`dist/`) and has no backend, so it can be hosted on any static host. The production demo runs on Vercel at [packaging-automation.vercel.app](https://packaging-automation.vercel.app).

## Vercel configuration

[`vercel.json`](../vercel.json) contains everything Vercel needs:

| Setting | Value | Why |
|---|---|---|
| `framework` | `vite` | Lets Vercel apply its Vite defaults |
| `buildCommand` | `npm run build` | Type-checks, then builds with Vite |
| `outputDirectory` | `dist` | Vite's output folder |
| `rewrites` | every path to `/index.html` | The app uses client-side routing, so deep links such as `/assets` or `/production?demo=1` must load the app shell on refresh |
| `headers` | long-lived cache on `/assets/*` | Vite fingerprints asset filenames, so they can be cached forever |

No environment variables are required.

## Deploy from GitHub (recommended)

1. Push the repository to GitHub.
2. In the Vercel dashboard, choose **Add New → Project** and import `packaging-automation-system-visualization`.
3. Set the **Project Name** to `packaging-automation`. This gives the domain `packaging-automation.vercel.app` (if it's free).
4. Leave the build settings as detected; `vercel.json` overrides them anyway.
5. Click **Deploy**.

After that, every push to `main` deploys to production and every pull request gets its own preview URL.

## Deploy from the command line

```bash
npm i -g vercel          # or use npx vercel
vercel login
vercel link --project packaging-automation
vercel --prod
```

## Custom domain name

The `*.vercel.app` subdomain comes from the project name. To change it later, open **Project → Settings → Domains** and add or edit the `.vercel.app` domain. Each subdomain is global across Vercel, so if `packaging-automation.vercel.app` is taken by another account you'll need a variant such as `packaging-automation-demo.vercel.app`.

## Check a build locally

```bash
npm run build
npm run preview          # serves dist/ on http://127.0.0.1:5180
```

Open `/production`, `/assets` and `/production?demo=1` and refresh each one to confirm routing works. On Vercel, the rewrite in `vercel.json` handles this; the local preview server does it automatically.
