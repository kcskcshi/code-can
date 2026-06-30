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
  /** new cumulative total after this event (authoritative) */
  total: number
  /** how many votes this event represents (usually 1) */
  amount: number
  /**
   * 'vote' increments the total; 'attack' decrements it (combat). Defaults to
   * 'vote'. The store keeps votes monotonic but lets attacks move totals down.
   */
  kind?: 'vote' | 'attack'
}

export type VoteResult =
  | { ok: true; total: number }
  | { ok: false; error: string; retryAfter?: number }

/** An ephemeral chat line broadcast to connected clients (never persisted). */
export interface ChatMessage {
  /** auto-assigned pixel nickname */
  nick: string
  /** message body */
  text: string
  /** client timestamp (ms) — used only for display ordering */
  ts: number
}

/** A combat assault: one army charges another. Drives the battlefield animation
 * only; the authoritative vote total is carried separately by VoteEvent. */
export interface AssaultEvent {
  /** attacker language slug (the charging army) */
  champion: string
  /** defender language slug (loses votes) */
  target: string
  /** how many votes were removed */
  amount: number
}

/** Handlers for the shared ephemeral "arena" realtime channel. */
export interface ArenaHandlers {
  onChat(m: ChatMessage): void
  onAssault(a: AssaultEvent): void
}

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
  /** Subscribe to live vote/attack updates. Returns an unsubscribe function. */
  subscribe(onVote: (e: VoteEvent) => void): () => void
  /** Cast a vote for a language. */
  vote(slug: string, turnstileToken: string | null): Promise<VoteResult>
  /** Attack a rival language, removing a few of its votes. Returns the rival's
   * new total. `champion` is the attacker's army (for the assault animation). */
  attack(
    target: string,
    champion: string,
    turnstileToken: string | null,
  ): Promise<VoteResult>
  /** Subscribe to the ephemeral arena channel (chat + assault). */
  subscribeArena(handlers: ArenaHandlers): () => void
  /** Broadcast a chat message (fire-and-forget; never persisted). */
  sendChat(m: ChatMessage): void
}
