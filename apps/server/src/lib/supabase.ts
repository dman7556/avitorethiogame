import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Server-side Supabase client (uses service_role key — bypasses RLS)
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Client for user-scoped operations (uses anon key — respects RLS)
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY
);
