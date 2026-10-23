# مسار (Masar)

Personal life app for Sayed, plus **حساب الشلة**, a shared expense app for housemates.
One codebase, two installable home-screen apps:

| File | App | Who |
|---|---|---|
| `site/index.html` | **مسار**: today, prayers, medication, group, settings | Sayed (email + password) |
| `site/shela.html` | **حساب الشلة**: group expenses only | Friends (invite code + PIN, no account) |

## Architecture

- **Front end:** plain ES modules, no build step (`site/`). Hosted on GitHub Pages. PWA with its own icons and service worker.
- **Back end:** Supabase (Postgres + Auth + Storage + Edge Functions).
  - Every table has Row-Level Security. Personal tables are readable only by their owner, and never by anonymous users.
  - Friends sign in anonymously, then `join_group(code, member, PIN)` binds them to one member of one group. They can read the group and add or edit only their own entries. Deletion is a soft flag, so history stays auditable.
  - PIN hashes sit in `member_pins`, which has no client policies. Five wrong tries lock the PIN for 15 minutes.
- **Secrets** (Anthropic key, VAPID private key, cron secret) live only in Supabase function secrets, set from GitHub Secrets. Nothing secret is in the repo or on the phone.

```
site/js/
  app.js                 shell + router (add new routes/tabs here)
  config.js              public Supabase URL + anon key
  core/                  dom helpers, dates, supabase client, push
  modules/
    auth/                owner sign-in
    today/               prayers (accountability only), medication check-ins
    shela/               math.js (pure, tested) · data.js · views.js · report.js
    settings/            notifications, group members / PINs / invite
supabase/
  migrations/            schema + RLS (versioned; add new files, never edit applied ones)
  functions/             ai · push-config · med-reminders
tests/                   unit tests (npm test) + UI smoke test (python3 tests/smoke.py)
```

### Adding a feature
1. New tables go in a new migration file `supabase/migrations/<timestamp>_<name>.sql`, with RLS.
2. A new module goes in `site/js/modules/<name>/`. It exports `render<Name>(root, rerender)` and registers its click actions with `registerActions`.
3. Add the route and tab in `site/js/app.js`, and the files to the `SHELL` list in `site/sw.js`.

## One-time setup

1. **Supabase project:** in Authentication → Providers, turn on **Email** and **Allow anonymous sign-ins**.
2. **GitHub Secrets** (repo → Settings → Secrets and variables → Actions):
   - `SUPABASE_PROJECT_REF`: the id in the project URL.
   - `SUPABASE_ACCESS_TOKEN`: supabase.com → Account → Access Tokens.
   - `SUPABASE_DB_PASSWORD`: the database password chosen when the project was created.
   - `ANTHROPIC_API_KEY`
   - `CRON_SECRET`: any long random string.
3. **Pages:** repo → Settings → Pages → Source: **GitHub Actions**.
4. **Run Actions:**
   - "Deploy database and functions to Supabase".
   - "Create push notification keys (run once)", typing `YES`.
5. **Medication reminders:** Supabase → Integrations → Cron → new job, every 5 minutes (`*/5 * * * *`), type *Supabase Edge Function* → `med-reminders`, with header `x-cron-secret: <CRON_SECRET>`.
6. **Owner account:**
   - Open the app, choose "اعمل الحساب", then sign in.
   - Then disable new email sign-ups in Supabase (Authentication → Sign In / Providers), so nobody else can create an account.
7. **Group:**
   - In Settings → اعمل الشلة, add members and give each one a PIN.
   - Send the link on WhatsApp from the same screen.

## Tests
- `npm test`: split and balance math.
- `python3 tests/smoke.py [out-dir]`: clicks through the owner and friend flows in headless Chromium, against an in-memory Supabase mock.
- The RLS rules were also checked against Postgres 16 with simulated owner, friend and stranger sessions.
