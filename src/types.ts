export interface Language {
  /** stable slug, also the primary key in the DB (e.g. "javascript") */
  slug: string
  /** display name (e.g. "JavaScript") */
  name: string
  /** short tag drawn on the pixel soldiers (e.g. "JS") */
  tag: string
  /** brand-ish hex color used to tint the army */
  color: string
  /** current cumulative vote total */
  votes: number
}

/** A single vote event broadcast to every connected client to drive battle FX. */
export interface VoteEvent {
  slug: string
  /** new cumulative total after this vote (authoritative) */
  total: number
  /** how many votes this event represents (usually 1) */
  amount: number
}

export type VoteResult =
  | { ok: true; total: number }
  | { ok: false; error: string; retryAfter?: number }

/**
 * Backend abstraction. Two implementations exist:
 *  - SupabaseBackend: real Postgres + Realtime + Edge Function
 *  - DemoBackend: in-memory simulation so the site is fully playable on
 *    GitHub Pages before Supabase is wired up.
 */
export interface Backend {
  readonly mode: 'live' | 'demo'
  /** Load the initial leaderboard. */
  load(): Promise<Language[]>
  /** Subscribe to live updates. Returns an unsubscribe function. */
  subscribe(onVote: (e: VoteEvent) => void): () => void
  /** Cast a vote for a language. */
  vote(slug: string, turnstileToken: string | null): Promise<VoteResult>
}
