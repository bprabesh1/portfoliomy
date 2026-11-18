# PRABESH – The Summit Journey

Interactive mountain-climbing portfolio + admin panel (`/prabeshadmin`).
Two ways to run it, same website and same admin:

| | Cloudflare (free) | Node server |
|---|---|---|
| Backend | `worker/index.mjs` + D1 database | `server.js` + SQLite file |
| Start | see below | `npm start` (Node 22.5+) |

## Deploy on Cloudflare (free plan, from GitHub)

**1. Create the database (once)**
1. Cloudflare dashboard → **Storage & Databases → D1 SQL Database → Create database**. Name it `portfolio`.
2. Open it → **Console** tab. Open `d1/setup.sql` from this project, copy everything, paste into the console, press **Execute**.
   (If the console complains about size, paste it in two halves – everything before the first `INSERT`, then the rest.)
3. On the database page copy the **Database ID**.

**2. Tell the project the database ID**
Open `wrangler.toml` in your GitHub repo → replace `PASTE-YOUR-D1-DATABASE-ID-HERE` with the ID → commit.

**3. Connect GitHub**
Dashboard → **Workers & Pages → Create → Import a repository** → choose your repo →
project/worker name must be `prabesh-portfolio` (same as `name` in `wrangler.toml`) →
Build command: *empty* · Deploy command: `npx wrangler deploy` → **Save and Deploy**.
If `wrangler.toml` is inside a sub-folder of the repo, set **Root directory** to that folder.

**4. Open it**
`https://prabesh-portfolio.<your-subdomain>.workers.dev` and `/prabeshadmin`.
First login: username `prabesh` + the temporary password given with the project. You are forced to choose a new one.
After that, open **My account** and set a security question (used by "Forgot password?").

Every `git push` redeploys the site automatically. Content you edit in the admin lives in D1 and is not touched by deploys.

### Free-plan limits (plenty for a portfolio)
- Static pages/images/JS: unlimited and free.
- Worker requests (API, admin, uploaded images, resume): 100,000 / day.
- D1: 5 GB storage, 5 million reads and 100,000 writes / day. One visit ≈ 1 write.
- Uploaded images and the resume PDF are stored inside D1: images are auto-shrunk by the admin panel (≤ 1.5 MB), resume PDF ≤ 2 MB.
- No credit card is needed for any of this.

### Lost your admin password?
Run `node scripts/reset-admin-sql.js "NewPassword123"` on any computer with Node, paste the printed `UPDATE …` line into the D1 **Console**, then log in with that password.
(Optional alternative: add secrets `ADMIN_USERNAME` / `ADMIN_PASSWORD` in the Worker settings – used only when there are **no** admins at all.)

### Local test of the Worker (optional)
`npx wrangler d1 execute portfolio --local --file=d1/setup.sql` then `npx wrangler dev`.

## Admin panel
- Dashboard: views, unique visitors, online now, referrers, devices, countries, visitor funnel, click/event rates, most-opened checkpoints, project clicks (7/30/90 days). Cookieless; the admin's own browsing and bots are not counted.
- Edit hero image, tagline, about text, contact details, summit text, resume PDF.
- Add / edit / delete / reorder checkpoints, certificates, projects, skills.
- Messages inbox: numbered, search, mark read/unread, bulk actions, delete.
- Admins (super only): add, edit, reset password, change role, delete.

## Journey
Checkpoints sit on the single SVG route by **Start date** (`YYYY` or `YYYY-MM`) and show their **Date label**. With exactly six, flags use the hand-tuned positions; otherwise they are spaced evenly.

## Honest notes
- The climber is the supplied still image animated procedurally (no rigged 3D model was supplied); the summit hand-meeting is a cinematic camera sequence on the supplied artwork.
- Email, phone, GitHub and LinkedIn are blank until you fill them in the admin.

## Node server (alternative)
`npm start` → http://localhost:3000. First run prints an admin password and saves it to `data/FIRST-RUN-CREDENTIALS.txt`. `npm run reset-admin` resets it. Env: `PORT`, `DATA_DIR`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TRUST_PROXY`.
