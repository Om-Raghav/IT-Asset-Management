# IT Asset Management System (ITAMS)

A full-stack web application to manage the complete lifecycle of IT assets
(laptops, desktops, printers, servers, monitors, and software licenses),
replacing spreadsheet-based tracking with a centralized system.

**Tech Stack** (as specified in the project document)
- **Frontend:** HTML5, CSS3, Bootstrap 5, JavaScript, jQuery, AJAX
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Authentication:** JWT (JSON Web Tokens)

## Project Structure

```
itams-project/
├── backend/                 # Node.js + Express REST API
│   ├── config/db.js         # MongoDB connection
│   ├── models/              # 18 Mongoose schemas (all collections from the spec)
│   ├── controllers/         # Business logic per module
│   ├── routes/               # Express routers, mounted under /api
│   ├── middleware/          # JWT auth, role guard, audit logging, file upload, error handler
│   ├── utils/                # Token generator, generic CRUD factory, async wrapper
│   ├── seed/seed.js          # Seeds an admin user + reference data
│   ├── server.js             # App entry point
│   └── package.json
│
└── frontend/                 # Static HTML/CSS/JS client (Bootstrap + jQuery + AJAX)
    ├── index.html             # Login page
    ├── dashboard.html         # KPI dashboard + AI smart summary
    ├── assets.html            # Asset CRUD
    ├── assignments.html       # Asset allocation workflow
    ├── returns.html           # Asset return workflow
    ├── categories.html, vendors.html, employees.html,
    │   departments.html, locations.html, repairs.html,
    │   licenses.html, amc.html, notifications.html   # Master-data CRUD pages
    ├── reports.html           # Tabbed reporting module
    ├── ai-assistant.html      # AI features (search, chat, predictions)
    ├── audit-logs.html        # Audit trail viewer
    ├── css/style.css
    └── js/                    # config.js, api.js, auth.js, common.js,
                                # crud-common.js (generic CRUD engine), + one script per page
```

## Modules Implemented

Login & Authentication (JWT) · Dashboard · Asset Category Management ·
Vendor Management · Asset Management · Employee Management · Asset
Allocation · Asset Return · Asset Repair · Software License Management ·
AMC Management · Reports · Notifications · Audit History.

**MongoDB collections (18):** Users, Roles, Permissions, Employees,
Departments, AssetCategories, Assets, Vendors, AssetAssignments,
AssetReturns, Repairs, SoftwareLicenses, AMCContracts, Locations,
Notifications, AuditLogs, Documents, Settings.

**AI Capabilities** (rule-based, so the project runs fully offline with
no external API key — swap in a real LLM/ML call later if desired):
natural language asset search, chat assistant, warranty expiry
prediction, duplicate asset detection, asset health scoring with
repair/replace/scrap recommendations, and a smart dashboard summary.

**Automatic background alerts:** a scheduler (`backend/services/notificationScheduler.js`)
runs on its own — no page needs to be open — checking every 24h (configurable)
for assets nearing warranty expiry, AMC contracts nearing expiry, and newly
detected duplicate assets, creating `Notification` records for each. Results
appear on the Notifications page. You can also trigger a check immediately
from the AI Assistant page ("Run Checks Now" button) instead of waiting for
the next scheduled run. Configure timing in `.env`:
```
NOTIFICATION_CHECK_INTERVAL_HOURS=24
WARRANTY_ALERT_DAYS=30
AMC_ALERT_DAYS=30
```

**Employee self-service portal:** users with `roleName: 'Employee'` are
redirected on login to a simplified `employee-dashboard.html` instead of
the full admin dashboard, and the sidebar only shows that one page (typing
an admin URL directly redirects them back). From there an employee can:
- View assets currently assigned to them (`GET /api/me/assets`)
- Report an issue on one of their own assets, which creates a `Repair`
  record for IT to triage (`POST /api/me/report-issue`)
- Request a return of one of their own assets, flagging the assignment
  for IT to process (`POST /api/me/request-return`)
- View notifications addressed to them (`GET /api/me/notifications`)

All `/api/me/*` endpoints are scoped strictly to the logged-in user's own
linked `Employee` record (via `User.employee`) — an employee can never see
or act on another employee's assets. The seed script creates a demo login
for this: `employee@itams.com` / `Employee@123`, pre-linked to a sample
employee with one demo asset assigned (warranty set to expire soon, handy
for testing the alert scheduler too).

**Creating logins for existing employees:** on the **Employees** page, each
row has a key icon (**Create Login**) — click it to give that employee a
login: pick a role (Employee/Manager/Admin), optionally set a password
(auto-generated if left blank), and it creates the account instantly,
showing the credentials once so you can share them. Backed by
`POST /api/employees/:id/create-login` (Admin only). Note `POST /api/auth/register`
itself is also Admin-only now (it used to be open for first-time setup,
but since `npm run seed` always creates the initial Admin, that's no
longer needed and leaving it public would let anyone self-register with
any role).

**Changing your own password:** every logged-in user — Admin or Employee —
has a **Change Password** button in the top bar on every page. It asks for
the current password (verified server-side before anything changes), a new
password (min. 6 characters), and a confirmation. Backed by
`PUT /api/auth/change-password`, available to any authenticated role, and
scoped to the logged-in user's own account only (no one can change someone
else's password through this endpoint).

**Admin resetting a forgotten password:** on the **Employees** page, next
to the key icon is a second, circular-arrow icon (**Reset Password**) —
use this when an employee already has a login but forgot their password.
Optionally set a specific new password, or leave it blank to
auto-generate one; either way it's shown once on screen for the Admin to
share. Backed by `POST /api/employees/:id/reset-password` (Admin only). If
the employee has no login yet, this returns an error telling you to use
**Create Login** instead — there's no email/reset-link flow since this
project doesn't send email; it's a direct, in-person credential handoff
model.

**Assigning software licenses to assets:** on the **Software Licenses**
page, each row has an "Assign to Asset" icon — opens a panel showing
seats used/total, the assets currently running that license (with a
one-click remove), and a dropdown to assign it to any not-yet-assigned
**Laptop** or **Desktop** asset. Assignment is blocked once all seats are
used (`seatsTotal`), so licenses can't be over-allocated. Backed by
`POST /api/software-licenses/:id/assign-asset` and `.../unassign-asset`
(Admin/Manager). A license's total seat usage now counts both this
(`assignedAssets`) and the existing employee-based assignment
(`assignedTo`) together — reflected in the License Usage report too.

**Asset tag generator:** in the Add/Edit Asset form, pick a **Vendor** and
**Category** first, then click **Generate** next to the Asset Tag field —
it fills in a tag like `DEL-LAP-0001` (first 3 letters of the vendor name
+ first 3 letters of the category name + a zero-padded sequence number).
The sequence looks at existing tags with the same vendor+category prefix
and picks the next free number, so it stays unique and gap-free even
after assets are deleted. You can still type a custom tag manually instead
if preferred — Generate just fills in a suggestion. Backed by
`GET /api/assets/generate-tag?vendorId=...&categoryId=...`.

**Selecting an asset by its tag + auto-matching vendor:** on the **AMC
Contracts** and **Repairs** forms, the Asset dropdown now shows the asset
tag alongside the name (e.g. `DEL-LAP-0001 - Dell Latitude 5420`) instead
of just the name, so you can find it by tag. Picking an asset there also
auto-fills the Vendor field with that asset's actual vendor (still
editable — useful for Repairs, where you might send it to a different
third-party repair shop instead).

**Search fix:** search boxes across the master-data pages (Vendors,
Employees, Departments, AMC Contracts, Repairs, Notifications, etc.) used
to only match a `name` field — which several of those models don't even
have, so searching **AMC Contracts** silently returned nothing no matter
what you typed. Each module's search now matches its actual relevant
fields (e.g. AMC Contracts search `contractNumber` + `coverageDetails`,
Employees search name/code/email, Repairs search the issue description).

**Floating chat widget:** the AI chat assistant is no longer confined to
the AI Assistant page — a small bubble (`frontend/js/chat-widget.js`)
floats in the bottom-right corner of every authenticated page (Admin and
Employee alike), click it to open a compact chat panel. It's plain
HTML/CSS/jQuery + native `fetch` rather than an actual React component
(this project has no React or bundler), built to match the same
floating-bubble UX that libraries like `react-chat-widget` provide.

**Real LLM chat via Groq, with live database access (optional, free):**
the chat assistant can be powered by an actual LLM instead of keyword
matching. Get a free API key at [console.groq.com](https://console.groq.com),
then in `backend/.env`:
```
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```
Restart the backend — that's it, no other setup. For **Admin/Manager**
accounts, the assistant gets real function-calling tool access
(`backend/utils/dbTools.js`, 18 read-only tools) to query assets,
employees, repairs, AMC contracts, software licenses, vendors, warranty
status, and cross-collection analytics live — so it can answer nearly any
question about your actual data (asset search/purchase/inventory
breakdowns, employee and warranty queries, maintenance history and
frequently-repaired assets, license seat/expiry status, department/vendor
analytics, and summarized reports) by calling the right lookup(s) itself,
seeing the results, and replying — chaining multiple lookups per question
if needed (capped at 5 tool-call rounds to prevent runaway loops). All
tools are read-only — nothing the chatbot does can create, update, or
delete data, and none of them expose User accounts, passwords, or auth
data. **Employee** accounts get a lighter mode instead: grounded in a
live stats snapshot but without direct database tool access, so employees
can't use chat to pull org-wide or other employees' data — consistent
with what they can already see elsewhere in the app. If `GROQ_API_KEY` is
left blank, or any Groq call fails (bad key, network issue, rate limit),
the chatbot automatically falls back to the original keyword-based logic
with zero downtime — nothing breaks either way. Uses Node's built-in
`fetch`, so no extra npm package is needed (requires Node 18+, already
the project's minimum).

*Out of scope:* this schema has no `Ticket`, `PurchaseOrder`, or
`AssetHistory`/transfer-log collections (only `AuditLog`, `Repair`, and
`AMCContract` exist) — ticket, purchase-order, and asset-transfer-history
style questions aren't covered by the chatbot's tools yet, since adding
them would mean creating new collections.

*Direct database access, by design here:* the chatbot's tools
(`dbTools.js`) query MongoDB directly through the existing Mongoose
models rather than routing through the REST API layer. That's a
deliberate choice for this project (simpler, one fewer network hop) —
if you'd rather the chatbot only ever call `/api/...` endpoints like the
rest of the frontend does, `dbTools.js` is the one file to change: swap
each tool's Mongoose query for a call to the matching existing
controller/API route.

**Conversation memory:** the chat widget keeps the last 12 turns of the
current session in the browser and sends them back with every request,
so follow-up/refinement questions work the way you'd expect — e.g. "Show
Dell laptops" → "Only available ones" → "Only in Delhi" → "Sort by
newest" all combine into one running filter instead of starting over
each time. History resets on page reload.

**Streaming and markdown:** replies stream in token-by-token over
Server-Sent Events (`POST /api/ai/chat/stream`, with the original
`POST /api/ai/chat` kept as a non-streaming fallback both the client and
server use automatically if streaming fails). Assistant replies support
lightweight markdown (bold, lists, inline code, and tables for larger
result sets, rendered with a small dependency-free parser built into
`chat-widget.js`), and each reply has a one-click copy button.

## Prerequisites

- [Node.js](https://nodejs.org) v18+ and npm
- [MongoDB](https://www.mongodb.com/try/download/community) running
  locally, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- A code editor (VS Code recommended) and Git

## Getting Started

### 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env if needed (MONGO_URI, JWT_SECRET, PORT, CLIENT_ORIGIN)

npm run seed     # creates an Admin user + baseline categories/departments/locations/vendors
npm run dev       # starts the API on http://localhost:5000 (nodemon, auto-reload)
# or: npm start
```

Default admin login created by the seed script:
```
Email:    admin@itams.com
Password: Admin@123
```

### 2. Frontend setup

The frontend is static HTML/CSS/JS — no build step required.

```bash
cd frontend
# Open index.html directly in a browser, OR serve it (recommended, avoids CORS/file:// issues):
npx serve .
# or use the VS Code "Live Server" extension
```

By default `frontend/js/config.js` points to `http://localhost:5000/api`.
Update `API_BASE_URL` there if your backend runs elsewhere, and update
`CLIENT_ORIGIN` in `backend/.env` to match wherever the frontend is served from.

### 3. Log in

Open the frontend URL, log in with the seeded admin credentials, and
explore the Dashboard, Assets, Allocations, Reports, and AI Assistant pages.

## API Overview

All endpoints are prefixed with `/api` and (except `/auth/login` and
`/auth/register`) require an `Authorization: Bearer <token>` header.

| Area | Base route |
|---|---|
| Auth | `/api/auth` (register [Admin], login, me, change-password) |
| Employee Self-Service | `/api/me` (profile, assets, repairs, report-issue, request-return, notifications) |
| Assets | `/api/assets` |
| Allocations | `/api/assignments` |
| Returns | `/api/returns` |
| Repairs | `/api/repairs` |
| Software Licenses | `/api/software-licenses` |
| AMC Contracts | `/api/amc-contracts` |
| Vendors / Employees / Departments / Locations | `/api/vendors`, `/api/employees`, `/api/departments`, `/api/locations` |
| Categories | `/api/asset-categories` |
| Dashboard | `/api/dashboard/summary` |
| Reports | `/api/reports/...` (asset-inventory, asset-utilization, warranty-expiry, repair-history, license-usage, amc-status, assignment-history) |
| AI | `/api/ai/...` (search, chat, warranty-prediction, duplicate-detection, health-prediction, smart-summary) |
| Notifications | `/api/notifications` |
| Audit Logs | `/api/audit-logs` |
| Documents | `/api/documents` (multipart upload) |

## Uploading & Hosting this Project on Git

### A. Push the project to GitHub

1. **Create a new empty repository** on GitHub (no README/gitignore — this project already has them), e.g. `itams-project`.
2. **Initialize git locally and push:**

   ```bash
   cd itams-project
   git init
   git add .
   git commit -m "Initial commit: ITAMS full-stack project"
   git branch -M main
   git remote add origin https://github.com/<your-username>/itams-project.git
   git push -u origin main
   ```

3. Because `backend/.env` is git-ignored, share `.env.example` instead so
   collaborators can create their own `.env`.

### B. (Optional) Split into two repos

If you'd rather manage frontend/backend as separate repositories:

```bash
# Backend
cd backend
git init && git add . && git commit -m "Backend: ITAMS API"
git remote add origin https://github.com/<your-username>/itams-backend.git
git push -u origin main

# Frontend
cd ../frontend
git init && git add . && git commit -m "Frontend: ITAMS UI"
git remote add origin https://github.com/<your-username>/itams-frontend.git
git push -u origin main
```

### C. Hosting the backend (Node.js + MongoDB)

Any Node-friendly host works. Common free/low-cost options:

1. **[Render](https://render.com)** – New → Web Service → connect your
   GitHub repo → set root directory to `backend` → build command
   `npm install` → start command `npm start` → add environment
   variables (`MONGO_URI`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`) from
   the dashboard.
2. **[Railway](https://railway.app)** – similar flow: deploy from
   GitHub, set root directory `backend`, add the same env vars.
3. **Database:** use [MongoDB Atlas](https://www.mongodb.com/atlas)
   (free tier) and paste its connection string into `MONGO_URI`.

After deployment, run the seed script once (Render/Railway shell, or a
one-off local run pointed at the Atlas URI):
```bash
MONGO_URI="<your atlas uri>" npm run seed
```

### D. Hosting the frontend (static site)

Since the frontend is plain HTML/CSS/JS:

1. **[GitHub Pages](https://pages.github.com)** – push the `frontend`
   folder to a repo, enable Pages on the `main` branch `/frontend`
   (or root) folder in **Settings → Pages**.
2. **[Netlify](https://netlify.com)** or **[Vercel](https://vercel.com)**
   – "Import project" from GitHub, set the publish directory to
   `frontend`, no build command needed.

Before deploying the frontend, update `frontend/js/config.js`:
```js
const API_BASE_URL = 'https://<your-deployed-backend-url>/api';
```
and set `CLIENT_ORIGIN` in the backend's environment variables to your
deployed frontend URL, so CORS allows the browser to call the API.

## Notes for Learners

This scaffold favors clarity and end-to-end coverage of every module
in the spec over exhaustive validation/edge-case handling — a good
base to extend with: express-validator rules on every route, refresh
tokens, granular role/permission checks tied to the `Permission`
model, pagination controls in the UI, and file-upload UI for the
`Document` module.
