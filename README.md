# Nexa AI Ready-to-Deploy MVP

This zip contains a deployable Next.js app with:

- Guest mode
- Login / sign up with Supabase
- Logout button
- Multi-mode chat: General, Startup, Student, Image
- Saved chats for logged-in users in Supabase
- Guest chats stored in localStorage
- Image generation UI and API route

## 1) Install

```bash
npm install
```

## 2) Add environment variables

Create `.env.local` from `.env.example` and fill these:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key_optional
GUEST_SESSION_SECRET=replace_with_a_long_random_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 3) Create Supabase tables

Open Supabase SQL Editor and run:

`supabase/schema.sql`

## 4) Supabase auth settings

For easiest testing:
- enable Email auth
- either disable email confirmation temporarily, or configure your confirmation flow properly
- add your local and production URLs in Auth URL configuration

Recommended URLs:
- `http://localhost:3000`
- your Vercel production URL

## 5) Run locally

```bash
npm run dev
```

## 6) Deploy to Vercel

Import the GitHub repo into Vercel and add the same environment variables there.

Important:
- set `NEXT_PUBLIC_APP_URL` to your production Vercel URL
- add that same URL to Supabase Auth URL Configuration
- set a strong `GUEST_SESSION_SECRET` in production so guest ownership cannot be forged
- do not deploy without `SUPABASE_SERVICE_ROLE_KEY`

## Notes

- Guest chats are saved only in the current browser.
- Logged-in chats are saved to Supabase.
- Image mode uses the OpenAI Images API.
- This is an MVP and still needs rate limits, billing, moderation, and production hardening before public scale.
