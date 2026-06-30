import type {
  ArenaHandlers,
  Backend,
  ChatMessage,
  Language,
  VoteEvent,
  VoteResult,
  Winner,
} from '../types'
import { LANGUAGES } from '../languages'

const VOTE_GAIN = 10 // a vote is +1.0 (10 tenths)

/**
 * In-memory backend so the site is fully alive on GitHub Pages before a
 * Supabase project is connected. It seeds plausible vote totals and simulates
 * a stream of votes from "other players" so the battlefield is never static.
 */
export class DemoBackend implements Backend {
  readonly mode = 'demo' as const

  private langs: Language[] = []
  private listeners = new Set<(e: VoteEvent) => void>()
  private arena = new Set<ArenaHandlers>()
  private timer: ReturnType<typeof setInterval> | null = null

  async load(): Promise<Language[]> {
    // Deterministic-ish seed (in tenths) so the diner looks lived-in on first paint.
    this.langs = LANGUAGES.map((l, i) => ({
      ...l,
      votes: Math.round(2000 / (i + 1) + 40 * ((i * 37) % 11)) * 10,
    }))
    this.startSimulation()
    return this.snapshot()
  }

  subscribe(onVote: (e: VoteEvent) => void): () => void {
    this.listeners.add(onVote)
    return () => this.listeners.delete(onVote)
  }

  async vote(slug: string, _token: string | null, amount = VOTE_GAIN): Promise<VoteResult> {
    const lang = this.langs.find((l) => l.slug === slug)
    if (!lang) return { ok: false, error: 'unknown menu' }
    lang.votes += amount
    this.emit({ slug, total: lang.votes, amount, kind: 'vote' })
    return { ok: true, total: lang.votes }
  }

  async attack(target: string, champion: string, _token: string | null, amount = 1): Promise<VoteResult> {
    const lang = this.langs.find((l) => l.slug === target)
    if (!lang) return { ok: false, error: 'unknown menu' }
    const removed = Math.min(amount, lang.votes)
    lang.votes = Math.max(0, lang.votes - amount)
    this.emit({ slug: target, total: lang.votes, amount: removed, kind: 'attack' })
    for (const h of this.arena) h.onAssault({ champion, target, amount: removed })
    return { ok: true, total: lang.votes }
  }

  subscribeArena(handlers: ArenaHandlers): () => void {
    this.arena.add(handlers)
    return () => this.arena.delete(handlers)
  }

  sendChat(_m: ChatMessage): void {
    // No other clients in demo mode. The chat panel shows your own message
    // optimistically, so there is nothing to broadcast here.
  }

  async rollRound(): Promise<void> {
    // no rounds in demo mode
  }

  async loadWinners(): Promise<Winner[]> {
    // a couple of plausible past winners so the hall of fame isn't empty
    return [
      { round_date: '2026-06-29', slug: 'chicken', name: '치킨', votes: 1840 },
      { round_date: '2026-06-28', slug: 'pizza', name: '피자', votes: 1720 },
      { round_date: '2026-06-27', slug: 'kimchi-stew', name: '김치찌개', votes: 1610 },
    ]
  }

  subscribePresence(onCount: (n: number) => void): () => void {
    // No real peers in demo mode — fake a small, gently wandering crowd.
    let n = 3
    let tick = 0
    onCount(n)
    const timer = setInterval(() => {
      tick++
      const step = ((tick * 1103515245 + 12345) >> 8) % 3 // 0,1,2 → -1,0,+1
      n = Math.max(1, Math.min(6, n + (step - 1)))
      onCount(n)
    }, 4000)
    return () => clearInterval(timer)
  }

  private snapshot(): Language[] {
    return this.langs.map((l) => ({ ...l }))
  }

  private emit(e: VoteEvent) {
    for (const fn of this.listeners) fn(e)
  }

  /** Weighted-random "ambient" votes — popular langs attract more, but upsets happen. */
  private startSimulation() {
    if (this.timer) return
    let tick = 0
    this.timer = setInterval(() => {
      tick++
      const weights = this.langs.map((l, i) => 1 + l.votes / 4000 + (i < 6 ? 2 : 0))
      const total = weights.reduce((a, b) => a + b, 0)
      // pseudo-random without Math.random staying deterministic enough to feel organic
      let r = ((tick * 9301 + 49297) % 233280) / 233280 * total
      let idx = 0
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]
        if (r <= 0) {
          idx = i
          break
        }
      }
      const lang = this.langs[idx]
      lang.votes += VOTE_GAIN
      this.emit({ slug: lang.slug, total: lang.votes, amount: VOTE_GAIN, kind: 'vote' })
    }, 900)
  }
}
