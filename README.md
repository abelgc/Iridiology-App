# Iridology Analysis App

A Next.js 14 application for iridological iris analysis using Claude AI.

## Features

- Upload iris images for AI-powered iridological analysis
- Three analysis modes: Standard, Comparison (temporal), Technical Review
- 11-section structured reports in Spanish
- Report editing, corrections, and chat interface
- Patient management with session history
- Supabase authentication and database

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Database & Auth**: Supabase (PostgreSQL)
- **AI**: Claude API (claude-opus-4-6) via Anthropic SDK
- **Deployment**: Railway

## Setup

### Prerequisites
- Node.js 18+
- Supabase project
- Anthropic API key

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Database Setup

Run the SQL in `docs/schema.sql` in your Supabase SQL editor to create the required tables and RLS policies.

### Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Testing

```bash
npm run test          # Unit and integration tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright)
```

## Deployment (Railway)

1. Push code to GitHub
2. Connect repository to Railway
3. Set environment variables in Railway dashboard
4. Railway auto-deploys on push

## Database Schema

See `docs/schema.sql` for the full schema including:
- `patients` — patient records
- `sessions` — analysis sessions per patient
- `reports` — generated iridology reports (JSONB)
- `report_corrections` — practitioner corrections per section
