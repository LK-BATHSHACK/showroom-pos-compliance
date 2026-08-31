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
   - **Resolved 31 Aug 2026 - "Tileshack Huttons" is Shore Rd.** (full name
     "Shore Road - Tileshack"), confirmed by Lorraine - not a separate or
     missing showroom. `parseSpotCheckExcel.ts` now aliases this column
     name to "Shore Rd." at parse time (`SHOWROOM_NAME_ALIASES`), so it
     resolves to the real Airtable showroom instead of erroring. This also
     closes out what had been logged as a coverage gap for Shore Rd. - it
     was never missing from the tracker, just present under this column
     name.
   - **Resolved 31 Aug 2026 - "Belfast" is Dargan**, confirmed by Lorraine -
     same pattern as Tileshack Huttons/Shore Rd., an old/informal column
     name for an existing Airtable showroom rather than a missing one.
     `parseSpotCheckExcel.ts` now aliases "Belfast" to "Dargan"
     (`SHOWROOM_NAME_ALIASES`). This closes out the Dargan half of the
     coverage gap below.
   - **Resolved 31 Aug 2026 - Lurgan added as a column.** Lurgan was
     tagged `AuditGroup = Group A` in Airtable but genuinely didn't appear
     anywhere in the tracker - not a naming mismatch like the two above,
     an actual missing column. Added a "Lurgan" column (mirroring the
     other showroom columns' structure and defaults) to both the
     evergreen "NI" template tab and the current "NI - Aug 2026" tab of
     Jordan's real tracker file, via direct XML surgery on the existing
     workbook per this project's Excel-editing standard (never round-trip
     an existing xlsx through a general-purpose Excel library) - verified
     well-formed and diffed against the original to confirm only the two
     worksheet parts changed. Updated file delivered to Lorraine to
     replace the version Jordan's using. With both this and the Belfast/
     Dargan alias, the NI/ROI tracker's showroom-name coverage now
     matches the live Airtable Showrooms table with no open gaps.
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
   headers rather than position. Two mappings were previously best-guesses;
   **resolved 31 Aug 2026** against the real live form (Lorraine sent the
   exported question list, since forms.cloud.microsoft can't be fetched
   directly by this tool):
   - "Duck Sale Wobblers" (Q8, "min. 10" wobblers) actually maps to "Sale
     Wobbler Ducks", not "Duck Stickers (General)" as originally guessed -
     fixed.
   - "A3 Sale Posters & Displays" (Q10) turned out to be one question
     covering *two* catalogue items at once ("Monthly Sale Posters (A3)"
     and "A3 Clear Sale Frames"), with a 3-way answer that does
     distinguish which is short ("We need more posters" vs "We need more
     displays"). Previously only "Monthly Sale Posters (A3)" ever got data
     from this question, and a "need more displays" answer would have
     wrongly flagged the posters instead of the frames. Fixed via a new
     `multiPosName` mapping type that splits the one answer across both
     catalogue items correctly.
   The "not on this list" and "other support" free-text questions
   auto-create a POS Request if answered.

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
**Value confirmed 31 Aug 2026 by Lorraine: `jordan.mckee@bathshack.com`**
- someone with Vercel project access needs to add it there since this
tool can't set Vercel env vars directly.

**Bug fixed 31 Aug 2026, found while screenshotting the app for Lorraine**: the
Submit Audit page's on-screen copy told users "the old multi-showroom Spot
Check workbook is no longer used" - directly wrong, since that's the NI/ROI
tracker format re-enabled back on 14 Aug 2026 and actively fixed twice more
in this same session (Tileshack Huttons/Shore Rd., Belfast/Dargan, Lurgan).
The upload logic itself was always correct (`isSpotCheckWorkbook` is live in
`app/api/upload-audit/route.ts`) - only the page's descriptive text was
stale. Fixed in `app/upload/page.tsx`.

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
