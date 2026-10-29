# Deploy StudyPlanner AI on Netlify

How it runs on Netlify:

| Part | Where it runs |
| --- | --- |
| React website (`client/`) | Netlify static hosting (`client/dist`) |
| Express API (`server/`) | One Netlify Function (`server/netlify/api.js`), reached at `/api/*` |
| Reminder worker | Scheduled Netlify Function every 15 minutes (`server/netlify/reminders.js`) |
| Database | MongoDB Atlas (required: Netlify cannot keep the local data file) |

Everything is configured in `netlify.toml`. Total time: about 20 minutes. All three services have free plans.

---

## Step 1 – MongoDB Atlas (database)

1. Go to **cloud.mongodb.com** and sign up (Google sign-in is fine).
2. **Create a cluster** → choose **M0 Free** → provider AWS, region **Mumbai (ap-south-1)** → Create.
3. **Database user**: when asked, set a username (e.g. `studyplanner`) and click **Autogenerate Secure Password**. Copy the password somewhere safe.
4. **Network Access** (left menu) → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`) → Confirm.
   Netlify's servers have changing addresses, so this is required.
5. **Database** (left menu) → **Connect** → **Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://studyplanner:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
6. Edit it: replace `<db_password>` with your password, and add the database name `studyplanner` after `.net/`:
   ```
   mongodb+srv://studyplanner:YOURPASSWORD@cluster0.abcde.mongodb.net/studyplanner?retryWrites=true&w=majority&appName=Cluster0
   ```
   If the password has symbols like `@ # / :`, autogenerate a new one without symbols (simplest).

## Step 2 – Put the code on GitHub

1. Sign in at **github.com** → **New repository** → name `ai-study-planner` → **Private** (or Public) → **Create repository**.
2. On the empty repo page click **uploading an existing file**.
3. Open the project folder (the one that contains `netlify.toml`, `client`, `server`). Select **everything inside it** and drag it into the browser.
   - Do **not** upload any `node_modules` folders (delete them first if you ran `npm run setup` locally) or `server/.env`.
4. Click **Commit changes**.

> Check: on GitHub you should see `netlify.toml`, `package.json`, `client/`, `server/`, `scripts/` at the top level of the repo.

## Step 3 – Create the Netlify site

1. Go to **app.netlify.com** → sign up with GitHub.
2. **Add new project → Import an existing project → GitHub** → authorise → pick `ai-study-planner`.
3. Netlify reads `netlify.toml`, so the build settings fill in by themselves:
   - Base directory: *(empty)*
   - Build command: `npm run setup && npm run build`
   - Publish directory: `client/dist`
   - Functions directory: `server/netlify`
4. Before deploying, open **Environment variables → Add variables** (or add them in step 4 below and redeploy):

| Key | Value |
| --- | --- |
| `MONGODB_URI` | the connection string from Step 1.6 |
| `JWT_SECRET` | any long random text, e.g. `vit-sp-8f3k2m9q7x1z4w6n` (40+ characters is best) |
| `NODE_ENV` | `production` |
| `GEMINI_API_KEY` | *(optional)* free key from aistudio.google.com → Get API key |

5. Click **Deploy**. The first build takes 2–3 minutes. When it says **Published**, open the site link (e.g. `https://ai-study-planner-xyz.netlify.app`).

## Step 4 – Check it works

1. Open `https://YOUR-SITE.netlify.app/api/health`. You should see:
   ```json
   {"ok":true,"db":"mongodb","ai":null}
   ```
   (`"ai":"gemini"` if you added the key.)
2. Open the site → **Create an account** → **Load sample data**. The dashboard should fill in.
3. In MongoDB Atlas → **Browse Collections**, you should now see `users`, `courses`, `assignments`, `schedules`, `attendancelogs`, `notifications`.

**Rename the site:** Netlify → Site configuration → **Change site name** → e.g. `studyplanner-vit` → `https://studyplanner-vit.netlify.app`.

**Updating later:** change files on GitHub (or upload again). Netlify rebuilds automatically on every commit.

---

## Troubleshooting

| What you see | Fix |
| --- | --- |
| `/api/health` says **MONGODB_URI is not set** | Add `MONGODB_URI` in Site configuration → Environment variables, then **Deploys → Trigger deploy → Deploy site** (variables only apply to new deploys). |
| Error mentioning **authentication failed** | Wrong password in the URI. Reset it in Atlas → Database Access, update `MONGODB_URI`, redeploy. |
| Error mentioning **timed out / server selection** | Atlas Network Access must include `0.0.0.0/0`. |
| Build fails at `npm run setup` | Make sure `package.json`, `client/package.json` and `server/package.json` were all uploaded, and no `node_modules` were. |
| Site loads but login says **Request failed (404)** | `netlify.toml` is missing from the repo root. Upload it and redeploy. |
| Plan says **AI was busy** | The AI took longer than 6 s (Netlify functions have a 10 s limit). The rule-based plan is used instead; this is expected behaviour. |
| Logs | Netlify → **Logs → Functions → api** shows server errors. |

## Optional: deploy from your laptop instead of GitHub

```bash
npm install -g netlify-cli
netlify login
netlify init            # create the site, follow the prompts
netlify env:set MONGODB_URI "your-connection-string"
netlify env:set JWT_SECRET "your-long-random-text"
netlify deploy --build --prod
```
