export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim()

/** Live mode requires a configured Supabase project; otherwise we run the demo. */
export const IS_LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** How many top languages clash on the battlefield at once. */
export const BATTLE_SQUADS = 8

/** Soldiers rendered for the #1 army; others scale by vote share. */
export const MAX_SOLDIERS = 36

/** Battle march tempo (beats/min). 4 beats per measure → "파타·파타·파타·폰". */
export const BPM = 120
