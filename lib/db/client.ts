/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

/*
 * Supabase client singleton
 *
 *  supabaseAdmin  ← service role key, bypasses all policies, SERVER-ONLY
 *  supabase       ← anon key, public reads only
 *
 *  CRITICAL: every API route must call requireAuth() or requireAdmin()
 *  before using supabaseAdmin. There is no RLS fallback — the service
 *  role key is the only gate.
 *
 *  Never import supabaseAdmin in client components or expose to the browser.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Public client — anon key, safe for public reads
export const supabase: SupabaseClient<any> = createClient<any>(supabaseUrl, supabaseAnonKey)

// Admin client — service role key, server-side only
const globalForSupabaseAdmin = globalThis as unknown as {
  supabaseAdmin: SupabaseClient<any> | undefined
}

export const supabaseAdmin: SupabaseClient<any> =
  globalForSupabaseAdmin.supabaseAdmin ??
  createClient<any>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForSupabaseAdmin.supabaseAdmin = supabaseAdmin
}
