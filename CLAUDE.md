# paltong-payroll — notes for Claude

- Static app (index.html + app.js + data.js) on Vercel, Supabase project "MONEY TRACKER" (`nffexcfunbnxoyrfhvnu`).
  SQL lives in `supabase/*.sql`; apply new files to the project when you add them.
- **Every staff-facing change → add an entry at the top of `WHATS_NEW` in app.js** (id = date, `ko` + `en` lines).
  Staff see unseen entries once after login and can reopen them from "My info" (owner request 2026-11-09).
- Printing: never tear down `#printOne` / `#batchPrint` on `afterprint` — Android Chrome fires it before the preview
  is drawn. Use `printOneDoc` / `docSheet` (print + 📤 share as image).
- Staff-callable RPCs take (p_no, p_pin) and start with `pr_emp_check`. Only lock-guarded / read RPCs go in
  `RETRY_RPC` (data.js) — never punches or advances.
- `npm test` runs the payroll calculation tests.
