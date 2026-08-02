# Senza Fine Operations

Private restaurant operations platform for Senza Fine Artos, powered by Azumie.

## Production architecture

- Next.js on Vercel
- Supabase Google authentication and staff roles
- Google Sheets operational database through a server-side Apps Script bridge
- Supabase audit and access-control records

## Environment variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AUTH_REQUIRED=true`
- `SENZA_SHEETS_BRIDGE_URL`
- `SENZA_SHEETS_TOKEN`

The Sheet bridge token must only be stored as a server-side Vercel environment variable.

## Development

```bash
npm install
npm run dev
```

## Database

Run `supabase/schema.sql` once in the Supabase SQL Editor. New Google accounts are created as inactive staff profiles and must be approved by a System Administrator or Owner.
