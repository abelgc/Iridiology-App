# Deployment Todo List

These are the manual steps required to deploy the app to production.

---

## Prerequisites ✅ (Already Done)

- [x] Supabase project created with schema deployed
- [x] `.env.local` configured locally with all API keys
- [x] App tested locally at `http://localhost:3000`
- [x] User account created and can log in
- [x] Dual AI providers (Anthropic + OpenAI) working
- [x] Settings UI allows runtime key management
- [x] Reports generate and print with full-page PDF layout

---

## Step 1 — Rotate API Keys (Security)

**Why:** Your current keys are on your local machine. Before deploying publicly, generate fresh ones.

### Anthropic Key
- [ ] Go to https://console.anthropic.com/account/keys
- [ ] Click the **trash icon** next to your current key to delete it
- [ ] Click **Create Key**, name it `iridology-prod`
- [ ] Copy the new key and save it (you'll use it in Step 3)

### OpenAI Key
- [ ] Go to https://platform.openai.com/api-keys
- [ ] Click **delete** next to your current key
- [ ] Click **Create new secret key**
- [ ] Copy the new key and save it (you'll use it in Step 3)

**Note:** `SUPABASE_SERVICE_ROLE_KEY` cannot be rotated — it's a static project key. You'll use your existing one.

---

## Step 2 — Prepare Environment Variables for Vercel

You'll need these 5 values. Gather them now:

| Variable | Where to Find It |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key (from your `.env.local`) |
| `ANTHROPIC_API_KEY` | **NEW key from Step 1** |
| `OPENAI_API_KEY` | **NEW key from Step 1** |

- [ ] Copy all 5 values to a text file (you'll paste them into Vercel in Step 4)

---

## Step 3 — Create Vercel Account & Connect GitHub

- [ ] Go to https://vercel.com
- [ ] Click **Sign Up** → **Continue with GitHub**
- [ ] Authorize Vercel to access your GitHub repos
- [ ] You're now signed in to Vercel

---

## Step 4 — Import Your App to Vercel

- [ ] In Vercel dashboard, click **New Project**
- [ ] Find **abelgc/Iridiology-App** in your GitHub repos, click **Import**
- [ ] **Project Name:** `iridology-app` (auto-filled, keep it)
- [ ] **Root Directory:** `./` (already set, keep it)
- [ ] Scroll down to **Environment Variables**
- [ ] Add the 5 variables from Step 2:
  - Key: `NEXT_PUBLIC_SUPABASE_URL` → Value: (your Supabase URL)
  - Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Value: (your anon key)
  - Key: `SUPABASE_SERVICE_ROLE_KEY` → Value: (your service_role key)
  - Key: `ANTHROPIC_API_KEY` → Value: (NEW key from Step 1)
  - Key: `OPENAI_API_KEY` → Value: (NEW key from Step 1)
- [ ] Click **Deploy**
- [ ] Wait 3–5 minutes for build to complete

---

## Step 5 — Get Your Live URL

- [ ] Once deployment finishes, Vercel shows your live URL
- [ ] It will be something like: `https://iridology-app-YOUR_USERNAME.vercel.app`
- [ ] Copy this URL and test it in your browser
- [ ] You should see the login page

---

## Step 6 — Enable Public Signup (If Testing with Friends)

If your friend needs to create their own account:

- [ ] Skip this step (leave public signup enabled by default)
- [ ] Friend can visit your URL and sign up with their email

If only you should be able to log in:

- [ ] In Supabase dashboard → **Authentication** → **Providers**
- [ ] Toggle **Email** OFF (disables public signup)
- [ ] Only you and people you manually invite can log in

- [ ] Choose: **Allow friend signups** or **Invite only** (decide now)

---

## Step 7 — Share with Friend for Testing

- [ ] Send your friend the live Vercel URL
- [ ] If signup is enabled: Friend creates account and tests
- [ ] If invite only: You create their account in Supabase, send credentials
- [ ] Friend tests: Create session, upload images, run analysis, translate report, print PDF

---

## Step 8 — Add Custom Domain (Later, Optional)

Once you're happy with the app, you can buy and add a custom domain:

- [ ] Buy domain on GoDaddy / Namecheap (~$10/year)
- [ ] In Vercel → Your Project → **Settings** → **Domains**
- [ ] Click **Add Domain**, type your domain name
- [ ] Follow Vercel's 2-minute DNS setup
- [ ] Done — app is now at `https://yourdomain.com`

**No code changes needed. No redeployment.**

---

## Checklist Summary

- [ ] Step 1: Rotated Anthropic & OpenAI keys
- [ ] Step 2: Gathered all 5 environment variables
- [ ] Step 3: Signed up for Vercel
- [ ] Step 4: Imported app to Vercel, added env vars, clicked Deploy
- [ ] Step 5: Got live URL, tested login page
- [ ] Step 6: Decided on public signup vs invite-only
- [ ] Step 7: Shared URL with friend, they tested the app
- [ ] Step 8 (Optional): Buy custom domain and point to Vercel

---

## Troubleshooting

**If deployment fails:**
- Check Vercel → Deployments → click failed deployment → **Logs**
- Most common: missing environment variable or typo

**If app doesn't work on live URL:**
- Check browser console (F12 → Console) for errors
- Verify all 5 env vars are correct in Vercel dashboard
- Redeploy if you changed anything

**If friend can't log in:**
- Make sure email signup is enabled in Supabase (or manually create their account)
- Check they're using correct email/password

---

Done! Your app is **production-ready**. 🚀
