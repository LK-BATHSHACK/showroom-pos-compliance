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

## Audit upload formats

**Process as of 14 Aug 2026**: every showroom self-reports monthly via the
Microsoft Form; Jordan's in-person visits are spot checks recorded on the
Audit Intake Template (not a full separate audit). The upload page
auto-detects which format a file is by sheet shape, not filename:

1. **Audit Intake Template.xlsx** - single showroom, any store, picked from
   a dropdown (`lib/parseAuditExcel.ts`, sheet named "Audit"). Kept for any
   ad-hoc one-off audit outside Jordan's regular round.
2. **Jordan Spot Check Round - Group A.xlsx** (added 21 Aug 2026) - the
   same layout, but one tab per Group A showroom (Boucher, Shore Rd.,
   Dargan, Antrim, Lisburn, Lurgan, Ballymena) in a single file, since
   Jordan visits all of them in one day. Each tab's showroom name is
   pre-filled so there's no dropdown to get wrong. Tabs he doesn't get to
   that day are just left blank - the parser skips them rather than erroring,
   detected by whether any Condition Status cell in that tab was touched.
   A tab that's started but missing a required field is reported back as a
   per-tab error without blocking the other showrooms in the same file.
   Both template variants share 29 POS items (see
   `excel_template/build_template.py`, which now generates both files).
3. **Microsoft Forms export** - every showroom's monthly self-report
   (`lib/parseMsFormsExcel.ts`) - one row per response, matched by column
   headers rather than position. Two mappings are best-guesses worth Jordan
   double-checking: "Duck Sale Wobblers" -> Duck Stickers (General), and
   "A3 Sale Posters & Displays" -> Monthly Sale Posters (A3) - both overlap
   a near-duplicate catalogue item name. The "not on this list" and "other
   support" free-text questions auto-create a POS Request if answered.

**Retired**: the multi-showroom Spot Check workbook
(`lib/parseSpotCheckExcel.ts`) - code is still there but no longer wired
into the upload route, since Jordan's role changed from full audits to spot
checks. Uploading one now gives a clear "no longer used" message rather
than failing confusingly. (Its multi-showroom convenience lives on in the
new Jordan Spot Check Round file above, just in the Audit Intake layout
rather than the old Spot Check workbook's format.)

Any batch upload (a Microsoft Forms export with multiple responses, or a
multi-tab round file with multiple filled-in showrooms) sends ONE
consolidated summary email and ONE consolidated designer email for the
whole batch, not one per showroom.

**Airtable select-field options must exist before code sends them.**
Airtable rejects a single/multi-select write with a value that isn't
already one of that field's options (e.g. `AuditType` = "Self-Reported
(Monthly)") - `lib/airtable.ts` now sends `typecast: true` so Airtable will
add a missing option automatically where the token's permissions allow it,
but if it doesn't, the fix is to add the option by hand in Airtable once
(Field menu -> Edit field -> Add option), the same way as any new POS
Master Catalogue item.

**Airtable follow-up needed**: three POS Master Catalogue items were added
to the code on 14 Aug 2026 (to match everything the Microsoft Form checks) -
`Tile Specials Leaflets`, `A6 Showroom Exclusives Labels`, `Trustpilot
Review Stickers`, all as Mandatory, weight 1. These need adding as actual
rows in the live Airtable POS Master Catalogue table too, or they won't be
scored (they'll just be silently excluded from the weighted score until the
rows exist - not an error, just not counted yet).

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
6. The `vercel.json` file already schedules the daily reminder job and the
   monthly summary job, no extra setup needed for either once deployed
   (Vercel Cron only runs on deployed projects, not locally).

## Environment variables

| Variable | What it's for |
|---|---|
| `AIRTABLE_TOKEN` | Personal Access Token, scoped to the Showroom POS Compliance base only |
| `AIRTABLE_BASE_ID` | The base's ID (starts `app...`) |
| `APP_PASSWORD` | Shared password for logging into the app |
| `SESSION_SECRET` | Random string used to sign the login session cookie |
| `RESEND_API_KEY` | For sending emails |
| `MARKETING_NOTIFY_EMAIL` | Where audit-completion, POS-request, and monthly summary notifications go |
| `DESIGNER_NOTIFY_EMAIL` | Where "POS flagged as missing/damaged" notifications go (optional - skipped if unset) |
| `CRON_SECRET` | Random string, checked on every `/api/cron/*` endpoint |

## Emails this app sends

| When | To | Content |
|---|---|---|
| An audit is uploaded | `MARKETING_NOTIFY_EMAIL` | Showroom, score, RAG, actions created, any support request |
| An audit flags items missing/damaged/needing attention | `DESIGNER_NOTIFY_EMAIL` | List of flagged items for that showroom, with priority and target date, so reprints/replacements can be organised |
| A new POS idea is submitted | `MARKETING_NOTIFY_EMAIL` | The idea and who submitted it, for review in the app |
| A POS idea is approved (via the Approve button in POS Requests) | `DESIGNER_NOTIFY_EMAIL` | Full idea details, so it can be created and rolled out |
| A POS idea is declined (via the Decline button in POS Requests) | The requester (`RequesterEmail` on the request) | The reason entered at decline time |
| Daily, 7am UTC, per showroom | Showroom manager | "Your POS review is coming up in `GroupB_ReminderLeadDays` days" - fires once, on that exact day |
| Daily, 7am UTC, per showroom | Showroom manager | "Today is your POS check. Please conduct your review and submit before the end of the day." - fires once, on the due date itself |
| Daily, 7am UTC, per showroom | Showroom manager + Regional Manager | Overdue escalation, at `Escalation_ToRegionalManager_Days` days overdue |
| Daily, 7am UTC, per showroom | + `MARKETING_NOTIFY_EMAIL` | Further escalation, at `Escalation_ToMarketing_Days` days overdue |
| Daily, 7am UTC, per action | Action owner | "Action due today" |
| 1st of each month, 8am UTC | `MARKETING_NOTIFY_EMAIL` | Full estate snapshot: avg score, RAG counts, overdue audits, open actions by priority, per-showroom table |

The reminder lead time (`GroupB_ReminderLeadDays`, default 5) and every SLA/
escalation threshold live in the Airtable **Settings** table, not in code -
edit the `SettingValue` cell there to change them, no redeploy needed.

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
- **Audit cadence** is a uniform 30 days for every showroom (since the 14
  Aug 2026 process change), hardcoded in `lib/processAuditSubmission.ts`.
  Easy to change, or move into Settings if you want it configurable
  without a code change.
- **Reminder/escalation emails fire on an exact day match** (e.g. "exactly
  5 days overdue"), so if the daily cron job ever fails to run on a given
  day, that day's reminder is silently missed rather than catching up the
  next day. Worth revisiting once this is running for real, a small
  "LastReminderSent" field per showroom would make it more robust.
