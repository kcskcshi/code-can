// code-can — vote Edge Function (Deno).
// Flow: CORS -> parse -> Turnstile verify -> rate limit -> atomic increment.
// Runs with the service_role key (bypasses RLS); clients can never write directly.
//
// Required secrets (auto-provided by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional secrets you set:
//   TURNSTILE_SECRET_KEY  - enables bot verification (omit to disable in dev)
//   VOTE_SALT             - salt for hashing IPs (set to any random string)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const WINDOW_SECONDS = 10
const MAX_PER_WINDOW = 5

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extra },
  })
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) return true // verification disabled (dev / not configured)
  if (!token) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  form.append('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  const out = (await res.json()) as { success: boolean }
  return out.success === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let payload: { slug?: unknown; turnstileToken?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const slug = typeof payload.slug === 'string' ? payload.slug : ''
  const turnstileToken =
    typeof payload.turnstileToken === 'string' ? payload.turnstileToken : null
  if (!slug || !/^[a-z0-9+#-]{1,24}$/.test(slug)) {
    return json({ error: 'invalid language slug' }, 400)
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'

  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return json({ error: 'bot verification failed' }, 403)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const salt = Deno.env.get('VOTE_SALT') ?? 'code-can'
  const ipHash = await sha256(`${salt}:${ip}`)

  // Rate limit: count this IP's recent votes.
  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()
  const { count, error: countErr } = await supabase
    .from('vote_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since)
  if (countErr) return json({ error: 'rate check failed' }, 500)
  if ((count ?? 0) >= MAX_PER_WINDOW) {
    return json({ error: 'too many votes, slow down', retryAfter: WINDOW_SECONDS }, 429, {
      'Retry-After': String(WINDOW_SECONDS),
    })
  }

  const { data, error } = await supabase.rpc('increment_vote', {
    p_slug: slug,
    p_ip_hash: ipHash,
  })
  if (error) {
    const unknown = error.message?.includes('unknown language')
    return json({ error: unknown ? 'unknown language' : 'vote failed' }, unknown ? 404 : 500)
  }

  return json({ ok: true, total: data })
})
