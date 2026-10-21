# Admin page (visitor and download statistics)

The website has a private page at `/admin` (file `website/admin.html`) that shows page views, visitors, clicks on the
download buttons, countries, traffic sources, devices and the real download counts of each release.

## How it works

| Number | Where it comes from |
|---|---|
| Views, visitors, download-button clicks, countries, sources, devices | The landing page sends one anonymous event per visit / button click to `/api/track` (`website/api/track.ts`). Counts are stored in an Upstash Redis database. |
| Real downloads per release | Read straight from the GitHub Releases API by the admin page (GitHub counts every download of the `.exe` files). |

Privacy: no IP address, cookie or user id is stored. A visitor is a hash of IP + browser + date + a secret that changes every
day, so the same person cannot be followed from one day to the next. Bots are ignored, and nothing is counted on `localhost`.

## One-time setup on Vercel

1. Vercel dashboard → your project → **Storage** → **Create Database** → **Upstash (Redis)** → free plan → connect it to the
   project (it adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` by itself).
2. Project → **Settings → Environment Variables** → add `ADMIN_PASSWORD` with a long random password (20+ characters;
   this is the only thing protecting the page).
3. **Deployments → Redeploy** so the functions pick the variables up.
4. Open `https://<your-site>/admin` and sign in.

## Who can see it

The page is not linked from anywhere, is excluded from search engines (`robots.txt`, `noindex`) and every number sits behind
the password, which is checked on the server: without it `/api/stats` returns nothing. Wrong guesses are limited to 10 per
15 minutes per address. Anyone who types the `/admin` address sees only the sign-in form.

## Testing locally

`npm --prefix website run dev` serves the pages but not `/api`; the site works without it, and the admin page then shows an
error until the Vercel functions exist. To exercise the functions on your machine use `npx vercel dev` (needs a Vercel login
and the same environment variables).
