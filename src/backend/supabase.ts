import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type {
  ArenaHandlers,
  Backend,
  ChatMessage,
  Language,
  VoteEvent,
  VoteResult,
  Winner,
} from '../types'
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
 * a SECURITY DEFINER RPC for validated voting/combat, and an ephemeral
 * broadcast channel for chat + assault animations. */
export class SupabaseBackend implements Backend {
  readonly mode = 'live' as const
  private client: SupabaseClient
  /** ephemeral broadcast channel for chat + assault (created on first use) */
  private arenaChannel: RealtimeChannel | null = null
  private arenaJoined = false

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
          // numeric/bigint can arrive as a string — coerce to a number.
          const total = Number(next.total_votes)
          const before =
            prev.total_votes != null ? Number(prev.total_votes) : total - 10
          // A drop means the row was attacked; a rise is a normal vote.
          const kind = total < before ? 'attack' : 'vote'
          const amount = Math.max(1, Math.abs(total - before))
          onVote({ slug: next.slug, total, amount, kind })
        },
      )
      .subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }

  async vote(
    slug: string,
    _turnstileToken: string | null,
    amount = 10,
  ): Promise<VoteResult> {
    // Votes go through the SECURITY DEFINER `cast_vote` RPC. Unlimited (no rate
    // limit) so hold-to-vote matches hold-to-attack. RLS still blocks direct
    // writes to the tables.
    const { data, error } = await this.client.rpc('cast_vote', {
      p_slug: slug,
      p_amount: amount,
    })
    if (error) {
      if (error.message?.includes('unknown menu')) {
        return { ok: false, error: 'unknown menu' }
      }
      return { ok: false, error: error.message ?? 'vote failed' }
    }
    return { ok: true, total: Number(data) }
  }

  async attack(
    target: string,
    champion: string,
    _turnstileToken: string | null,
    amount = 1,
  ): Promise<VoteResult> {
    // `attack_language` (SECURITY DEFINER) removes `amount` tenths from the
    // target, clamped at 0. No rate limit — attacking is unlimited.
    const { data, error } = await this.client.rpc('attack_language', {
      p_target: target,
      p_amount: amount,
    })
    if (error) {
      if (error.message?.includes('unknown menu')) {
        return { ok: false, error: 'unknown menu' }
      }
      return { ok: false, error: error.message ?? 'attack failed' }
    }
    // Broadcast the (batched) assault so other clients animate the strike; the
    // vote total itself propagates authoritatively via postgres_changes.
    this.joinArena().send({
      type: 'broadcast',
      event: 'assault',
      payload: { champion, target, amount },
    })
    return { ok: true, total: Number(data) }
  }

  subscribeArena(handlers: ArenaHandlers): () => void {
    // Attach handlers BEFORE subscribing — Realtime ignores listeners added
    // after a channel has joined.
    const channel = this.getArena()
    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) =>
        handlers.onChat(payload as ChatMessage),
      )
      .on('broadcast', { event: 'assault' }, ({ payload }) =>
        handlers.onAssault(payload as { champion: string; target: string; amount: number }),
      )
    this.joinArena()
    return () => {
      void this.client.removeChannel(channel)
      this.arenaChannel = null
      this.arenaJoined = false
    }
  }

  sendChat(m: ChatMessage): void {
    this.joinArena().send({ type: 'broadcast', event: 'chat', payload: m })
  }

  async rollRound(): Promise<void> {
    // Best-effort: if the function isn't installed yet, ignore (daily rounds off).
    const { error } = await this.client.rpc('roll_round_if_due')
    if (error) console.warn('[code-can] rollRound skipped:', error.message)
  }

  async loadWinners(): Promise<Winner[]> {
    const { data, error } = await this.client
      .from('winners')
      .select('round_date,slug,name,votes')
      .order('round_date', { ascending: false })
      .limit(14)
    if (error) {
      console.warn('[code-can] loadWinners skipped:', error.message)
      return []
    }
    return (data as Winner[]).map((w) => ({ ...w, votes: Number(w.votes) }))
  }

  subscribePresence(onCount: (n: number) => void): () => void {
    // A dedicated presence channel; each connected client tracks itself, so the
    // number of presence keys is the live player count.
    const channel = this.client.channel('lobby')
    channel.on('presence', { event: 'sync' }, () => {
      onCount(Object.keys(channel.presenceState()).length)
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void channel.track({ at: 0 })
    })
    return () => {
      void this.client.removeChannel(channel)
    }
  }

  /** The shared ephemeral broadcast channel (created once, not yet subscribed). */
  private getArena(): RealtimeChannel {
    if (!this.arenaChannel) {
      this.arenaChannel = this.client.channel('arena', {
        config: { broadcast: { self: false } },
      })
    }
    return this.arenaChannel
  }

  /** Subscribe the arena channel exactly once, then return it for sending. */
  private joinArena(): RealtimeChannel {
    const channel = this.getArena()
    if (!this.arenaJoined) {
      channel.subscribe()
      this.arenaJoined = true
    }
    return channel
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
