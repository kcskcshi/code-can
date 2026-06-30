/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xyzcompany.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (public) key */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Cloudflare Turnstile site key (public). Optional — voting still works without it. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
