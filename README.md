# CHATistry

A minimal, real-time chat platform. No email required — just a username and password.

## Features
- Username + password login (no email verification needed)
- Search users by username
- Real-time messaging via Supabase Realtime (WSS on port 443)
- Typing indicators via Broadcast channels (zero DB writes)
- Online presence via Realtime Presence (auto-cleans on disconnect)
- Chat history stored in Supabase; messages beyond 100 per conversation are auto-deleted

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the env example and fill in your Supabase credentials:
   ```
   cp env.example .env.local
   ```

3. In your Supabase dashboard:
   - Go to **Authentication → Providers → Email**
   - Turn **OFF** "Confirm email" (required — no email verification by design)

4. Run the app:
   ```
   npm run dev
   ```

## Supabase project
Project: **chatice** (`grhflrveidlcdrwyghde`) · Region: ap-northeast-2
