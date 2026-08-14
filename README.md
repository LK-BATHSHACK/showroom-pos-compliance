# Showroom POS Compliance

A Bathshack internal tool replacing the SharePoint/Power Platform build we
started earlier. Showroom staff fill out an Excel audit template and upload
it here; the app scores compliance, creates corrective actions
automatically, and shows an executive dashboard. Built per the
`bathshack-app-build-standards` skill: GitHub -> Vercel, Airtable as the
data store, Resend for email, all secrets in environment variables.

## What's included

- Password-gated dashboard (Executive Overview, Showroom drill-down,
  Actions Tracker, POS Requests)
- Excel audit upload -> automatic parsing, weighted compliance scoring,
  RAG status, auto-created corrective Actions
- POS idea/request submission form with approve/decline
- Daily reminder/escalation emails via a Vercel Cron job

## Before you deploy

1. **Set up Airtable.** Follow `Airtable Setup Guide.md` (in the files I
   sent alongside this) to create the base and import the three starter
   tables, plus the four blank ones.
2. **Get a Resend account** (or use an existing Bathshack one) and verify
   a sending domain, or use Resend's own test domain to start.
3. Have your GitHub and Vercel accounts ready.

## Local development

```
npm install
cp .env.local.example .env.local
# fill in .env.local with your real values
npm run dev
```

Visit `http://localhost:3000`, you'll land on the login page first.

## Deploying

1. Create a new (empty) GitHub repository.
2. Push this folder to it:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
3. In Vercel: **Add New** > **Project** > import that GitHub repo. Vercel
   auto-detects Next.js, no config needed.
4. Before the first deploy finishes (or right after), go to **Project
   Settings > Environment Variables** and add every variable listed in
   `.env.local.example`, with your real values. Never commit `.env.local`
   itself, it's already in `.gitignore`.
5. Redeploy if you added env vars after the first deploy.
6. The `vercel.json` file already schedules the daily reminder job, no
   extra setup needed for that once deployed (Vercel Cron only runs on
   deployed projects, not locally).

## Environment variables

| Variable | What it's for |
|---|---|
| `AIRTABLE_TOKEN` | Personal Access Token, scoped to the Showroom POS Compliance base only |
| `AIRTABLE_BASE_ID` | The base's ID (starts `app...`) |
| `APP_PASSWORD` | Shared password for logging into the app |
| `SESSION_SECRET` | Random string used to sign the login session cookie |
| `RESEND_API_KEY` | For sending emails |
| `MARKETING_NOTIFY_EMAIL` | Where audit-completion and POS-request notifications go |
| `CRON_SECRET` | Random string, checked on the daily reminder endpoint |

## Known V1 simplifications (worth knowing about, not blockers)

- **Single shared password**, not the tiered Staff / Regional Manager /
  Marketing access from the original design. Everyone who logs in sees
  everything. Fine to ship as-is for a small team; flag if you want
  role-based views added later.
- **Photos aren't captured yet** in the Excel upload flow. The Photo field
  exists on Audit Line Items in Airtable, ready for a follow-up "attach
  photos after upload" step.
- **The uploaded Excel file itself isn't stored** (the `SourceFile`
  attachment field is unused for now), storing it needs a small file-hosting
  step (e.g. Vercel Blob) that wasn't in scope for this first pass.
- **The "critical item override"** (Section 7 of the original design,
  where one serious issue caps the score at Amber regardless of the
  average) is wired up in code but the actual trigger list
  (`CRITICAL_POS_ITEM_NAMES` in `lib/scoring.ts`) is empty, exactly as the
  design doc flagged, this needs Marketing to agree the short list of
  items serious enough to trigger it.
- **Audit cadence** defaults to every 28 days for Group A showrooms and
  every 90 days for Group B, hardcoded in `app/api/upload-audit/route.ts`.
  Easy to change, or move into Settings if you want it configurable
  without a code change.
- **Reminder/escalation emails fire on an exact day match** (e.g. "exactly
  5 days overdue"), so if the daily cron job ever fails to run on a given
  day, that day's reminder is silently missed rather than catching up the
  next day. Worth revisiting once this is running for real, a small
  "LastReminderSent" field per showroom would make it more robust.
