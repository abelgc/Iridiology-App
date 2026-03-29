# Manual Setup Todo List

These are the steps that cannot be automated — they require you to click around in dashboards.

---

## Step 1 — Run the database schema in Supabase ✅ (project already created)

- [ ] In your Supabase dashboard, click **SQL Editor** in the left sidebar
- [ ] Click **New query** (top right)
- [ ] Open `C:\Dev\iridology-app\docs\schema.sql` in Notepad, select all (Ctrl+A), copy (Ctrl+C)
- [ ] Paste into the SQL Editor and click **Run**
- [ ] You should see "Success. No rows returned"

## Step 2 — Copy your Supabase keys

- [ ] In the left sidebar click **Project Settings** → **API**
- [ ] Copy the **Project URL** (looks like `https://xxxx.supabase.co`)
- [ ] Copy the **anon public** key
- [ ] Copy the **service_role** key (click the eye icon to reveal it)
- [ ] Paste all 3 to Claude so it can create the `.env.local` file

## Step 3 — Get your Anthropic API key

- [ ] Go to https://console.anthropic.com and sign in
- [ ] Click **API Keys** in the left menu
- [ ] Click **Create Key**, name it `iridology-app`, copy the key
- [ ] Paste it to Claude so it can add it to `.env.local`

## Step 4 — Claude creates .env.local (automatic, Claude does this)

- [ ] Claude writes the file for you once you paste the keys

## Step 5 — Run the app locally

- [ ] In your terminal: `cd C:\Dev\iridology-app && npm run dev`
- [ ] Open http://localhost:3000 in your browser
- [ ] You should see the login page

## Step 6 — Create your user account in Supabase

- [ ] In Supabase dashboard, click **Authentication** → **Users** in the left sidebar
- [ ] Click **Add user** → **Create new user**
- [ ] Enter your email and a password
- [ ] Use those credentials to log in at http://localhost:3000/login

## Step 8 — Expand report sections to match real report format (Claude does this)

The app currently generates 11 sections (body systems 1–10 + a generic conclusion).
The real report format needs 4 more sections after the body system findings:

- Rename `section_11` from "Conclusión" → **"Ejes Detectados"** (Detected Axes — AI-generated)
- Add `section_12` → **"Enfoque Ayurvédico"** (Ayurvedic diagnosis — AI-generated: Vata/Pitta/etc.)
- Add `section_13` → **"Protocolo de Tratamiento"** (Treatment Protocol — you fill this manually with your specific products/dosages)
- Add `section_14` → **"Alimentación"** (Food recommendations — AI-generated)

Files to change: `src/types/report.ts`, `src/lib/claude/prompts.ts`
Everything else (validator, viewer, editor) adapts automatically.

- [ ] Tell Claude: "implement the report section expansion from the todo list"

---

## Step 7 — Deploy to Railway (after local test works)

- [ ] Go to https://railway.app and sign up / log in
- [ ] Click **New Project** → **Deploy from GitHub repo**
- [ ] Select your `abelgc/Iridiology-App` repository
- [ ] Railway will detect the `nixpacks.toml` and start building automatically
- [ ] Once deployed, click **Variables** and add the same 4 env vars from `.env.local`
- [ ] Railway gives you a public URL — your app is live!
