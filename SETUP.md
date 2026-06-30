# MCA Oral Exam Slot Monitor — Setup Guide

## What it does
Checks the MCA portal 4× per day for oral exam cancellations earlier than your current booking date. Emails you instantly when one appears. Shows a live dashboard on Vercel.

---

## Step 1 — Supabase (database + email storage)

1. Go to https://supabase.com → New project → name it `mca-monitor`
2. In the SQL editor, paste and run the contents of `supabase/schema.sql`
3. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY`

---

## Step 2 — Resend (email notifications)

1. Go to https://resend.com → sign up (free tier = 3,000 emails/month)
2. Create an API key → copy it → `RESEND_API_KEY`
3. Verify your email domain or use the sandbox `onboarding@resend.dev` sender for testing

---

## Step 3 — GitHub Secrets (for the scheduled checker)

In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret name             | Value                              |
|-------------------------|------------------------------------|
| `SUPABASE_URL`          | Your Supabase project URL          |
| `SUPABASE_SERVICE_KEY`  | Supabase service_role key          |
| `MCA_SDS_NUMBER`        | Your Seafarer Reference Number (from your NoE email) |
| `MCA_DOB`               | Your date of birth, format `DD/MM/YYYY` |
| `RESEND_API_KEY`        | Resend API key                     |
| `NOTIFY_EMAIL`          | Where to send alerts (your email)  |
| `TARGET_DATE`           | `2025-11-25` (your current booking)|

---

## Step 4 — Vercel (dashboard)

1. Go to https://vercel.com → New Project → import this GitHub repo
2. Add these **Environment Variables** in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `TARGET_DATE` = `2025-11-25`
3. Click Deploy — your dashboard is live

---

## Step 5 — Test it manually

Go to your GitHub repo → **Actions → MCA Slot Monitor → Run workflow** to trigger a check now.
Watch the logs to confirm login works, then check the Supabase `checks` table.

---

## Schedule
Checks run automatically at **07:00, 11:00, 15:00, 19:00 UTC** every day via GitHub Actions.
