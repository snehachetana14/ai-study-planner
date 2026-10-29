# StudyPlanner AI – AI-Based Study Planner and Productivity Coach

BCSE301P Software Engineering project · Sneha Chetana (24BYB0171), Ramsha Akbar (24BYB0186)

A full-stack web app that builds a personalised study schedule, re-plans it automatically when a
session is missed or a task is added, tracks attendance, sends reminders that escalate as deadlines
approach, and flags early signs of burnout.

- **Frontend:** React 19 + Vite (`client/`)
- **Backend:** Node.js + Express (`server/`)
- **Database:** MongoDB / MongoDB Atlas via Mongoose. With no database set, a local JSON file is used.
- **AI:** Google Gemini or OpenAI, both optional. Without a key, the rule-based planner is used.

---

## 1. Run it on your laptop (5 minutes)

You need **Node.js 20 or newer** (`node -v` to check). Download it from nodejs.org if needed.

```bash
# 1. Install everything (run once, from the project folder)
npm run setup

# 2. Start the API and the website together
npm run dev
```

Open **http://localhost:5173**, create an account, then click **Load sample data** to get a filled-in
semester (4 courses, 6 upcoming tasks, 2 weeks of study history, 4 weeks of attendance).

No database and no AI key are needed for this. Data is saved in `server/data/dev-db.json`.

> Two terminals instead of `npm run dev`: run `npm run dev` inside `server/`, and `npm run dev` inside `client/`.

### Use MongoDB Atlas (recommended for the final demo)

1. Create a free cluster at cloud.mongodb.com → **Database Access**: add a user → **Network Access**: allow your IP (or `0.0.0.0/0` for Render).
2. Click **Connect → Drivers** and copy the connection string.
3. Copy `server/.env.example` to `server/.env` and set:
   ```
   MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/studyplanner
   JWT_SECRET=any-long-random-text
   ```
4. Restart `npm run dev`. The server log says `[db] Connected to MongoDB`. View the data in MongoDB Compass.

### Turn on AI planning

Add **one** key to `server/.env` and restart:

```
GEMINI_API_KEY=your-key        # free key: aistudio.google.com → Get API key
# or
OPENAI_API_KEY=your-key
```

The pill on the Schedule page changes to **✓ Planned by AI**. Every AI plan is checked by `PlanValidator`
before it is saved. If the AI is slow (over 8 s), fails, or proposes an invalid plan, the app falls
back to the rule-based planner and says why ("AI was busy", "AI plan failed checks").

---

## 2. Features, by module (Assessment 1)

| Module | What the app does | Where |
| --- | --- | --- |
| Authentication | Sign up, log in, JWT sessions (7 days), scrypt-hashed passwords | Login page |
| Course & Assignment Manager | Courses with colour and minimum attendance; assignments, exams and quizzes with deadline, weight, difficulty and hours; complete, reopen, edit, delete | Courses page, Add task dialog |
| AI Scheduling Engine | Priority score (50% deadline + 30% weight + 20% difficulty), AI suggestions, validation, rule-based fallback, 2-hour blocks with 30-minute breaks, nothing after 11 PM | Schedule page |
| Adaptive re-planning | Mark a session missed → plan rebuilds → "What changed" → choose how to handle work that no longer fits → Undo | Schedule page (Screen 3) |
| Attendance / Progress Tracker | Present/absent per class, % per course, "you can miss N more" / "attend the next N", hours studied per task | Attendance page, Courses page |
| Notification Service | Reminder before each session, deadline warnings at 24 h, then 3 h, then overdue; low-attendance alerts | Bell icon (checked every minute) |
| Analytics & Burnout Dashboard | Last 14 days: planned vs studied chart, missed sessions and reasons, late-night study, long days, risk level and suggestions | Insights page, Dashboard |

### AI Quick Add (Assessment 10)

On the **Schedule** page, type a task in plain English, e.g.
*"DBMS assignment 4 on transactions due Monday 5 pm, worth 10%, about 3 hours, medium"*, and click
**✨ Fill with AI**. Gemini (or OpenAI) extracts the course, type, title, deadline, weight, difficulty and hours
and opens the Add Task form already filled in, with a ✨ AI tag on every field it filled. The student checks it
and clicks **Add & re-plan**. Every AI value is validated (`server/src/ai/TaskParser.js → sanitize`); invalid or
missing values are filled by a built-in rule-based parser, and anything still missing is highlighted. Without an
API key or internet, the built-in parser handles the whole sentence. Endpoint: `POST /api/ai/quick-add`.

### The three Assessment 9 screens

| Assessment 9 | In the app |
| --- | --- |
| Screen 1 – Weekly schedule | **Schedule** page: sidebar menu, + Add task (primary), Re-plan, plan-source pill, warning banner, session cards with Done / Missed, "Why this order?" panel |
| Screen 2 – Add task form | **+ Add task**: course dropdown, Assignment/Exam/Quiz, title, deadline date and time, weight (0–100, error under the field), difficulty 1–5, hours stepper with free-hours helper, re-plan checkbox; button disabled until valid |
| Screen 3 – Missed session | **✕ Missed** on a card: confirm with reason chips → progress bar → "Plan updated" with Removed / Moved / Kept / Full, conflict box with two choices, Next up, toast with Undo |

### Demo script for the viva (about 3 minutes)

1. Sign up → **Load sample data** → show the Dashboard.
2. **Schedule**: point out the priority badges, the plan-source pill and **Why this order?**
3. **+ Add task**: type weight `130` to show the error and the disabled button, then fix it and add the task. Show "What changed".
4. Click **✕ Missed** on **Surprise quiz prep**, pick **Busy**, confirm. Show "Plan updated", then click **Add 1 h on …** in the conflict box. Then **Undo**.
5. **Attendance**: mark a class; show Computer Networks below 75% with "attend the next N classes".
6. **Insights**: risk level, chart, missed reasons. **Settings**: change Monday's hours → Save & re-plan.

---

## 3. Project structure (matches the Assessment 7 package diagram)

```
ai-study-planner/
├── client/                     React frontend (Vite)
│   └── src/
│       ├── pages/              Login, Dashboard, Schedule, Courses, Attendance, Insights, Settings
│       ├── components/         SessionCard, AddTaskDialog, MissedFlow, ReplanResult, WhyOrder,
│       │                       SourcePill, NotificationBell, Sidebar, Modal, Toast, ConfirmDialog
│       ├── hooks/useSchedule   loads the plan; Done / Missed / Undo / conflict actions
│       ├── api.js              fetch wrapper with the JWT
│       └── utils/format.js     dates, times, labels
├── server/                     Express backend
│   ├── src/
│   │   ├── routes/             URL → controller mapping (all under /api)
│   │   ├── middleware/         authJwt, validateRequest, errorHandler
│   │   ├── controllers/        auth, course, assignment, schedule, tracker, analytics
│   │   ├── services/           ReplanningService, planner, NotificationService,
│   │   │                       AttendanceService, BurnoutAnalyzer, settingsService, demoData
│   │   ├── ai/                 PriorityScorer, PromptBuilder, AIClient, PlanValidator
│   │   ├── models/             Mongoose schemas: User, Course, Assignment, Schedule,
│   │   │                       AttendanceLog, Notification
│   │   ├── db/                 mongoStore (MongoDB) and memoryStore (JSON file), same interface
│   │   ├── utils/              jwt, password, dates, validators, logger
│   │   ├── app.js              builds the Express app
│   │   └── index.js            starts server + reminder worker
│   └── test/                   43 automated tests (engine + API)
└── scripts/dev.js              runs server and client together
```

## 4. REST API

All routes are under `/api`. Everything except signup/login needs `Authorization: Bearer <token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/signup`, `/auth/login` | Create account / log in → `{ token, user }` |
| GET | `/auth/me` | Current user |
| GET, POST | `/courses` | List / add courses |
| PATCH, DELETE | `/courses/:id` | Edit / delete (deletes its tasks and attendance) |
| GET, POST | `/assignments` | List / add tasks (`replan: true` re-plans and returns what changed) |
| PATCH, DELETE | `/assignments/:id` | Edit, complete, reopen, delete |
| GET | `/schedule` | Everything the Schedule page needs |
| POST | `/schedule/replan` | Re-plan now |
| POST | `/schedule/undo` | Restore the plan before the last change |
| POST | `/schedule/resolve` | `{ taskId, action: "addHours" \| "remind" }` for work that does not fit |
| PATCH | `/sessions/:id` | `{ status: "done" \| "missed" \| "planned", reason }` |
| GET, POST | `/attendance` | Summary per course / mark present or absent |
| DELETE | `/attendance/:id` | Remove a record |
| GET | `/insights` | Burnout analysis for the last 14 days |
| GET | `/notifications`, POST `/notifications/read` | Reminders / mark read |
| GET, PUT | `/settings` | Study hours per weekday, start times, time zone, AI on/off, reminders |
| POST | `/demo/seed` | Load sample data for the logged-in user |
| GET | `/health` | `{ ok, db, ai }` |

## 5. Tests

```bash
npm test                                                       # 52 tests, about 1 second
TEST_MONGO_URI=mongodb://localhost:27017/sp_test npm test      # API tests against a real MongoDB
```

Covered: priority scoring, date rules, plan validation, AI reply parsing, availability, greedy and
deadline-first planning, AI success / error / invalid plan / switched off, done hours, conflicts,
plan diff, signup/login/401, validation errors (weight 130), add task + re-plan, missed + re-plan +
undo, done hours, conflict resolution, settings, attendance maths, sample data, insights, notifications.

## 6. Deploy

**Netlify + MongoDB Atlas (recommended):** follow **[DEPLOY_NETLIFY.md](DEPLOY_NETLIFY.md)**. The React site is
hosted by Netlify, the Express API runs as a Netlify Function (`server/netlify/api.js`) and reminders run as a
scheduled function. All settings are in `netlify.toml`.

**One service on Render (alternative):**

1. Push this folder to GitHub.
2. Render → **New Web Service** → pick the repo.
   - Build command: `npm run setup && npm run build`
   - Start command: `npm start`
3. Environment variables: `MONGODB_URI`, `JWT_SECRET`, optionally `GEMINI_API_KEY`, and `NODE_ENV=production`.
4. Render gives a URL; the Express server serves both the API and the React app.

**Frontend on Vercel, API on Render (as in the Assessment 7 deployment diagram):**

- Render: root directory `server`, build `npm install`, start `npm start`, and set `CLIENT_ORIGIN=https://your-app.vercel.app`.
- Vercel: root directory `client`, framework Vite, env `VITE_API_URL=https://your-api.onrender.com`.

## 7. Who built what

| Area | Owner |
| --- | --- |
| React pages and components (Schedule, Add task, Missed flow, Dashboard, Courses, Attendance, Insights, Settings), styling | Ramsha Akbar (Frontend & AI) |
| AI integration: PriorityScorer, PromptBuilder, AIClient, PlanValidator | Ramsha Akbar |
| Express API, routes, middleware, JWT auth | Sneha Chetana (Backend & Data) |
| MongoDB models and data layer, ReplanningService, planner, notifications, attendance, burnout analytics | Sneha Chetana |
| Tests, README, deployment | Both |

## 8. Troubleshooting

- **`npm run dev` says port 5000 is in use**: set `PORT=5001` in `server/.env` and change the proxy in `client/vite.config.js` to match.
- **MongoDB connection fails**: check the password in the URI (URL-encode special characters) and that your IP is allowed in Atlas → Network Access.
- **Plan says "AI was busy"**: the AI request failed or took longer than `AI_TIMEOUT_MS`; the reason is in the server log. The rule-based plan is still valid.
- **Times look shifted**: set your time zone in **Settings** (default India, UTC+5:30).
- **Start over with the local file store**: stop the server and delete `server/data/dev-db.json`.
