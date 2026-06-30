import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Language, VoteEvent, VoteResult } from '../types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import { LANGUAGE_BY_SLUG } from '../languages'

interface LanguageRow {
  slug: string
  name: string
  tag: string
  color: string
  total_votes: number
}

/** Real backend: Postgres for totals, Realtime for the shared battlefield,
 * an Edge Function for validated voting. */
export class SupabaseBackend implements Backend {
  readonly mode = 'live' as const
  private client: SupabaseClient

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  }

  async load(): Promise<Language[]> {
    const { data, error } = await this.client
      .from('languages')
      .select('slug,name,tag,color,total_votes')
      .order('total_votes', { ascending: false })
    if (error) throw error
    return (data as LanguageRow[]).map(rowToLanguage)
  }

  subscribe(onVote: (e: VoteEvent) => void): () => void {
    const channel = this.client
      .channel('battlefield')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'languages' },
        (payload) => {
          const next = payload.new as LanguageRow
          const prev = payload.old as Partial<LanguageRow>
          const total = next.total_votes
          const amount =
            typeof prev.total_votes === 'number'
              ? Math.max(1, total - prev.total_votes)
              : 1
          onVote({ slug: next.slug, total, amount })
        },
      )
      .subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }

  async vote(slug: string, _turnstileToken: string | null): Promise<VoteResult> {
    // Votes go through the SECURITY DEFINER `cast_vote` RPC, which derives the
    // client IP server-side and rate-limits in the database. (RLS still blocks
    // any direct write to the tables.)
    const { data, error } = await this.client.rpc('cast_vote', { p_slug: slug })
    if (error) {
      if (error.message?.includes('rate_limited')) {
        return { ok: false, error: 'too many votes, slow down', retryAfter: 10 }
      }
      if (error.message?.includes('unknown language')) {
        return { ok: false, error: 'unknown language' }
      }
      return { ok: false, error: error.message ?? 'vote failed' }
    }
    return { ok: true, total: data as number }
  }
}

function rowToLanguage(row: LanguageRow): Language {
  // Prefer the local catalog for tag/color so the look stays consistent even
  // if the DB row is sparse, but fall back to whatever the DB provides.
  const meta = LANGUAGE_BY_SLUG[row.slug]
  return {
    slug: row.slug,
    name: row.name ?? meta?.name ?? row.slug,
    tag: meta?.tag ?? row.tag ?? row.slug.slice(0, 3).toUpperCase(),
    color: meta?.color ?? row.color ?? '#888888',
    votes: row.total_votes ?? 0,
  }
}
