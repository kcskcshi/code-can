import type { AssaultEvent, ChatMessage, Language, VoteEvent } from './types'

export interface FeedItem {
  id: number
  slug: string
  name: string
  tag: string
  color: string
  total: number
  self: boolean
  /** 'vote' = gained votes, 'attack' = lost votes to combat */
  kind: 'vote' | 'attack'
}

type ChangeListener = () => void
type FxListener = (e: VoteEvent & { self: boolean }) => void
type AssaultListener = (a: AssaultEvent) => void
type ChatListener = () => void
type ChampionListener = (slug: string | null) => void

const FEED_MAX = 24
const CHAT_MAX = 50

/**
 * Single source of truth on the client. The backend pushes vote/attack events
 * in; the leaderboard/feed listen for `change`, the battlefield listens for
 * `fx`/`assault`, the chat panel listens for `chatChange`.
 */
export class Store {
  private bySlug = new Map<string, Language>()
  private lastTotal = new Map<string, number>()
  private feed: FeedItem[] = []
  private chat: ChatMessage[] = []
  private changeListeners = new Set<ChangeListener>()
  private fxListeners = new Set<FxListener>()
  private assaultListeners = new Set<AssaultListener>()
  private chatListeners = new Set<ChatListener>()
  private championListeners = new Set<ChampionListener>()
  private feedId = 0
  private championSlug: string | null = null

  init(langs: Language[]) {
    this.bySlug.clear()
    this.lastTotal.clear()
    for (const l of langs) {
      this.bySlug.set(l.slug, { ...l })
      this.lastTotal.set(l.slug, l.votes)
    }
    this.emitChange()
  }

  /** Apply a vote or attack (from the live stream or our own optimistic action). */
  applyVote(e: VoteEvent, self = false) {
    const lang = this.bySlug.get(e.slug)
    if (!lang) return
    const kind = e.kind ?? 'vote'
    const seen = this.lastTotal.get(e.slug) ?? lang.votes
    // (slug,total) is an idempotency key: an exact match is the echo of our own
    // optimistic update or a duplicate event — drop it.
    if (e.total === seen) return
    // Votes are monotonic, so a lower total is a stale/out-of-order vote — drop.
    // Attacks legitimately move the total down, so they bypass this guard.
    if (kind !== 'attack' && e.total < seen) return

    this.lastTotal.set(e.slug, e.total)
    lang.votes = e.total
    // A self-vote sets your champion (the army you're fighting for).
    if (self && kind === 'vote') this.setChampion(e.slug)

    this.feed.unshift({
      id: this.feedId++,
      slug: lang.slug,
      name: lang.name,
      tag: lang.tag,
      color: lang.color,
      total: lang.votes,
      self,
      kind,
    })
    if (this.feed.length > FEED_MAX) this.feed.length = FEED_MAX
    this.fxListeners.forEach((fn) => fn({ ...e, kind, self }))
    this.emitChange()
  }

  /** Relay an assault to the battlefield (animation only; totals come via applyVote). */
  emitAssault(a: AssaultEvent) {
    this.assaultListeners.forEach((fn) => fn(a))
  }

  // ---- champion (your army) -------------------------------------------------
  setChampion(slug: string) {
    if (this.championSlug === slug) return
    if (!this.bySlug.has(slug)) return
    this.championSlug = slug
    this.championListeners.forEach((fn) => fn(slug))
  }

  /** The chosen champion, falling back to the current leader. */
  getChampion(): string | null {
    if (this.championSlug && this.bySlug.has(this.championSlug)) return this.championSlug
    return this.ranked()[0]?.slug ?? null
  }

  onChampionChange(fn: ChampionListener): () => void {
    this.championListeners.add(fn)
    return () => this.championListeners.delete(fn)
  }

  // ---- chat ------------------------------------------------------------------
  addChat(m: ChatMessage) {
    // Guard against the narrow window where a live broadcast and the persisted
    // history both carry the same line — same (nick, ts, text) means a dupe.
    if (this.chat.some((c) => c.ts === m.ts && c.nick === m.nick && c.text === m.text)) {
      return
    }
    this.chat.push(m)
    if (this.chat.length > CHAT_MAX) this.chat.splice(0, this.chat.length - CHAT_MAX)
    this.chatListeners.forEach((fn) => fn())
  }

  recentChat(): ChatMessage[] {
    return this.chat
  }

  onChatChange(fn: ChatListener): () => void {
    this.chatListeners.add(fn)
    return () => this.chatListeners.delete(fn)
  }

  // ---- queries --------------------------------------------------------------
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

  onAssault(fn: AssaultListener): () => void {
    this.assaultListeners.add(fn)
    return () => this.assaultListeners.delete(fn)
  }

  private emitChange() {
    this.changeListeners.forEach((fn) => fn())
  }
}
