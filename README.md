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

## Login

- Admin: `vikneshraja@goat-robotics.com` / `Goat@Production`
- Viewer: `view@goat-robotics.com` / `Goat@view2026`

(Signing in is now optional for viewing — see point 8 above.)
