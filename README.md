# GOAT Robotics — Production Dashboard (PRD-Tracker)

Ready-to-deploy web app. Upload this folder to Vercel — Vercel runs
`npm install` and `npm run build` for you automatically.

## What's new in this update

1. **Menu** — the sidebar is now a proper toggleable menu (tap the ☰ icon).
   It slides in as a white panel over a black backdrop, and stays fixed
   open on larger screens.
2. **Selected item highlight** — the active sidebar item now has a smooth
   sliding "liquid" highlight with bold text, and a normal pointer cursor
   on every clickable control.
3. **Highlighted headings** — section titles (Overview, Gantt Timeline,
   Project List, etc.) now have a bold highlighted style.
4. **Download Timeline** — a new "Download Timeline" button (Overview /
   Configuration page) exports a real Excel Gantt: one tab per team, with
   day-by-day duration bars, red highlighting on overlapping schedules,
   and the GOAT logo in the corner of every sheet.
5. **Header logo** — the sidebar/login header now shows a larger logo with
   "PRD-Tracker" underneath instead of the old "Production Gantt" label.
6. **Search** — there's now a dedicated Search button right next to the
   search box (press Enter or click it to jump to the top match).
7. **Notifications** — clicking a notification now takes you straight to
   the project it's about.
8. **Shared live data / no login to view** — anyone with the link can now
   view the dashboard without signing in; only Create/Edit/Delete require
   the Admin login. To make the data live and shared across every visitor
   (instead of just the local browser), connect a free Supabase database:

   1. Create a project at https://supabase.com
   2. In the SQL editor, run the table + policy statements in the comment
      at the top of `src/lib/db.js`.
   3. In Vercel → your project → Settings → Environment Variables, add:
      - `VITE_SUPABASE_URL`
      - `VITE_SUPABASE_ANON_KEY`
   4. Redeploy. Until these are set, the app keeps working exactly as
      before, using each browser's local storage.

## What's new in this round

1. **Login required to open the link** — the dashboard no longer shows a
   read-only preview to signed-out visitors. Opening the link now always
   shows the sign-in screen first; the dashboard only renders after a
   successful login.
2. **Toggle direction** — confirmed/standardized every on/off switch in the
   app (Menu / Module Configuration, Custom Menu, Enable/Disable Users) to
   the same rule: **ON = knob right + blue**, **OFF = knob left + grey**.
3. **Customizable Appearance (Settings → Appearance)** — Admins can now
   adjust brightness and a two-color gradient separately for the **Side
   Menu** and for the **Option Menus** (profile dropdown, notifications
   panel, search results). The white option-menu panels also default to a
   slightly dimmer, less stark white. Changes apply live and persist for
   every visitor, with a "Reset to default" button.
4. **Logo** — increased the header/sidebar logo size, and removed the white
   box baked into the PNG so only the "goat." mark and "Robotics" text show
   — it now blends into the sidebar/login background instead of sitting in
   a white rectangle.

## Revision: sidebar, manufacturing and approval-based access

- White Arial sidebar; new navigation: Overview, Project Configuration,
  Manufacturing (Task Feeds, Machining, Sheetmetal, Welding), Timeline,
  Settings (+ Admin Contact), Configuration Portal (admin only).
- Manufacturing -> Task Feeds creates/edits/deletes tasks and manages employees
  (database tables `employees`, `tasks`). Machining / Sheetmetal / Welding pages
  are live views of those same records.
- Real authentication (Supabase Auth). Users register, an administrator approves
  them under Configuration Portal -> Approval. Access is enforced by row level
  security in the database. **No passwords are stored in the code.**

### One-time setup (required)

1. Supabase SQL editor: run `supabase/migration.sql`.
2. Supabase -> Authentication -> Providers -> Email: keep "Confirm email" ON.
3. Open the site, choose "New user? Request access", register
   `vikneshraja@goat-robotics.com` and confirm the email.
4. Run the bootstrap `update public.profiles ... role='Admin'` statement at the
   bottom of the migration file to make that account the administrator.
5. Vercel env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` stay as they are.

The previously published demo passwords (in the old README) must be considered
compromised; they no longer work and should not be reused anywhere.

## Revision: Documents menu

The old single **Timeline** item is replaced by **Documents**, with four options:

1. **Timeline** — the same Overall Project Timeline / Gantt chart as before.
2. **RCA** — incident report: date & time, reported person, location, description,
   explanation, corrective action, preventive action, fix date, expected date, and
   three sign-offs (Department Head, Team Manager, Employee) drawn on screen.
3. **Costing** — vendor changes: old vs new vendor and unit cost, quantity; the
   amount saved is calculated and totalled (with a printable summary report).
4. **Bottleneck** — project studies: project name, duration, improvements, and
   bottleneck points with their solutions.

Every record opens as a formatted document (**eye icon**) with **Print / Save as PDF**.
Administrators create, edit and delete; other approved users can view and print.

**One-time setup:** in the Supabase SQL editor run `supabase/documents.sql`
(after `migration.sql`). It creates `rca_reports`, `costing_records` and
`bottleneck_studies` with the same approval-based row level security. Until it is
run, these pages show a "could not load records" message when a database is connected.
