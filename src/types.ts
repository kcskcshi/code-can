export interface Language {
  /** stable slug, also the primary key in the DB (e.g. "kimchi-stew") */
  slug: string
  /** display name (e.g. "김치찌개") */
  name: string
  /** short label drawn on the planet (e.g. "김치") */
  tag: string
  /** food-ish hex color used to tint the planet */
  color: string
  /** cute emoji shown on the planet */
  emoji?: string
  /**
   * Current cumulative total in TENTHS of a vote (a vote is +10, an attack is
   * −1). Display divides by 10. Keeping it integer avoids float drift.
   */
  votes: number
}

/** A single vote event broadcast to every connected client to drive battle FX. */
export interface VoteEvent {
  slug: string
  /** new cumulative total (TENTHS) after this event (authoritative) */
  total: number
  /** magnitude of this event in TENTHS (a vote is 10, one attack tick is 1) */
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

/** A combat assault: one planet strikes another. Drives the battlefield
 * animation only; the authoritative vote total is carried separately by
 * VoteEvent. */
export interface AssaultEvent {
  /** attacker slug (the striking planet) */
  champion: string
  /** defender slug (loses votes) */
  target: string
  /** how many tenths were removed in this (possibly batched) strike */
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
  /** Attack a rival, removing `amount` tenths of its votes (default 1 = 0.1).
   * Returns the rival's new total. `champion` is the attacker (for the assault
   * animation). `amount` lets the client batch rapid auto-fire into one call. */
  attack(
    target: string,
    champion: string,
    turnstileToken: string | null,
    amount?: number,
  ): Promise<VoteResult>
  /** Subscribe to the ephemeral arena channel (chat + assault). */
  subscribeArena(handlers: ArenaHandlers): () => void
  /** Broadcast a chat message (fire-and-forget; never persisted). */
  sendChat(m: ChatMessage): void
}
