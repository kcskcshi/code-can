import type { Language, VoteEvent } from './types'

export interface FeedItem {
  id: number
  slug: string
  name: string
  tag: string
  color: string
  total: number
  self: boolean
}

type ChangeListener = () => void
type FxListener = (e: VoteEvent & { self: boolean }) => void

const FEED_MAX = 24

/**
 * Single source of truth on the client. The backend pushes vote events in;
 * the leaderboard/feed listen for `change`, the battlefield listens for `fx`.
 */
export class Store {
  private bySlug = new Map<string, Language>()
  private lastTotal = new Map<string, number>()
  private feed: FeedItem[] = []
  private changeListeners = new Set<ChangeListener>()
  private fxListeners = new Set<FxListener>()
  private feedId = 0

  init(langs: Language[]) {
    this.bySlug.clear()
    this.lastTotal.clear()
    for (const l of langs) {
      this.bySlug.set(l.slug, { ...l })
      this.lastTotal.set(l.slug, l.votes)
    }
    this.emitChange()
  }

  /** Apply a vote (from the live stream or our own optimistic action). */
  applyVote(e: VoteEvent, self = false) {
    const lang = this.bySlug.get(e.slug)
    if (!lang) return
    // Totals are strictly increasing per language, so (slug,total) is an
    // idempotency key: drop stale events and echoes of our own optimistic vote.
    const seen = this.lastTotal.get(e.slug) ?? lang.votes
    if (e.total <= seen) return
    this.lastTotal.set(e.slug, e.total)
    lang.votes = e.total
    this.feed.unshift({
      id: this.feedId++,
      slug: lang.slug,
      name: lang.name,
      tag: lang.tag,
      color: lang.color,
      total: lang.votes,
      self,
    })
    if (this.feed.length > FEED_MAX) this.feed.length = FEED_MAX
    this.fxListeners.forEach((fn) => fn({ ...e, self }))
    this.emitChange()
  }

  ranked(): Language[] {
    return [...this.bySlug.values()].sort((a, b) => b.votes - a.votes)
  }

  get(slug: string): Language | undefined {
    return this.bySlug.get(slug)
  }

  totalVotes(): number {
    let t = 0
    for (const l of this.bySlug.values()) t += l.votes
    return t
  }

  recentFeed(): FeedItem[] {
    return this.feed
  }

  onChange(fn: ChangeListener): () => void {
    this.changeListeners.add(fn)
    return () => this.changeListeners.delete(fn)
  }

  onFx(fn: FxListener): () => void {
    this.fxListeners.add(fn)
    return () => this.fxListeners.delete(fn)
  }

  private emitChange() {
    this.changeListeners.forEach((fn) => fn())
  }
}
