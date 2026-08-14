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
Microsoft Form; Jordan's in-person visits are spot checks. The upload page
auto-detects which format a file is by sheet shape, not filename:

1. **Showrooms POS Spot Check (NI/ROI tracker)** - `lib/parseSpotCheckExcel.ts`.
   **This is Jordan's real, live working file** (confirmed 14 Aug 2026) -
   one tab per region (`NI - <month>`, `ROI - <month>`), showrooms as
   columns, POS items as rows, values default to the "Example / correct
   allocation" column and Jordan overwrites only the cells where reality
   differs. An earlier assumption that he'd moved to the Audit Intake
   Template instead was wrong - this format had been switched off in the
   upload route (see git history) and was re-enabled once that was
   clarified.
   - **Known gap - showroom name mismatch**: the NI tab's "Belfast" and
     "Tileshack Huttons" columns don't match any name in the live Airtable
     Showrooms table (13 rows, none named either of those) - any data
     entered under them will come back as a per-showroom error
     ("Showroom ... wasn't found in Airtable") rather than being silently
     dropped, but it needs resolving with Jordan/Lorraine: are these old
     names for two of the 13 existing showrooms, or genuinely missing
     showroom rows?
   - **Known gap - coverage**: Shore Rd., Dargan, and Lurgan are tagged
     `AuditGroup = Group A` in Airtable but don't appear as columns in
     either tracker tab at all - worth confirming whether Jordan's real
     round actually covers them (under a different name?) or whether
     they're being missed by this tracker entirely.
   - **Important operational caveat**: this format has no per-showroom
     "visited" signal - a showroom Jordan hasn't gotten to yet this month
     looks IDENTICAL to one he's checked and found fully compliant, because
     both cases leave every cell matching the reference column untouched.
     `inferConditionStatus` (in `lib/parsedAudit.ts`) can't tell the
     difference. **Only upload this file after Jordan has completed the
     full round for the month** - uploading a partially-completed or
     not-yet-started copy will record every untouched showroom as 100%
     compliant, not skip it. (Confirmed by testing against a real uploaded
     copy: an unstarted August tracker parsed as 11 fully-compliant
     showrooms with no errors, because "not yet checked" and "checked, all
     good" are textually indistinguishable in this format.)
2. **Audit Intake Template.xlsx** - single showroom, any store, picked from
   a dropdown (`lib/parseAuditExcel.ts`, sheet named "Audit"). Kept for any
   ad-hoc one-off audit outside Jordan's regular round.
3. **Jordan Spot Check Round - Group A.xlsx** - the same layout, but one tab
   per Group A showroom (Boucher, Shore Rd., Dargan, Antrim, Lisburn,
   Lurgan, Ballymena) in a single file. Built to solve "one file covers my
   whole day's round" - **now that the NI/ROI tracker above is confirmed as
   Jordan's real file and already does this, this template may be
   redundant** - worth confirming with him whether he needs both or just
   the NI/ROI tracker, so he isn't left juggling two different
   "everything in one file" options that both claim to do the same job.
4. **Microsoft Forms export** - every showroom's monthly self-report
   (`lib/parseMsFormsExcel.ts`) - one row per response, matched by column
   headers rather than position. Two mappings are best-guesses worth Jordan
   double-checking: "Duck Sale Wobblers" -> Duck Stickers (General), and
   "A3 Sale Posters & Displays" -> Monthly Sale Posters (A3) - both overlap
   a near-duplicate catalogue item name. The "not on this list" and "other
   support" free-text questions auto-create a POS Request if answered.

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

**Email sending fix (found 12 Aug 2026, live now)**: `lib/resend.ts`'s
hardcoded "from" address was `notifications@bathshapp.com` - a domain that
was never added to the Resend account, only `bathshack.com` is Verified
there. Resend rejects a send from a non-verified domain, and its SDK
resolves rather than throws on that rejection, so **every single email this
app tried to send had been failing silently since launch** - no crash, no
error in the response, nothing in the Resend Emails log, nothing anywhere,
because the code never checked the `error` field the SDK returned. Fixed by
(1) changing the "from" address to use `bathshack.com`, and (2)
`console.error`-logging `result.error` when a send fails, so a future
problem like this shows up in Vercel's function logs instead of vanishing.
**Still needs**: a redeploy for this fix to take effect, and adding
`DESIGNER_NOTIFY_EMAIL` in Vercel (Project Settings -> Environment
Variables) - it's currently unset on the live project, so designer
notification emails are silently skipped by design until it's added.

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
