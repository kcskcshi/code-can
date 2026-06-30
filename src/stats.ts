/**
 * Per-browser play stats + achievements, persisted to localStorage. Anonymous;
 * nothing leaves the device. Drives the "내 기록" modal and unlock toasts.
 */

export interface StatsData {
  voteTenths: number
  attackTenths: number
  voteTicks: number
  attackTicks: number
  bestCombo: number
  menusVoted: string[]
  sharedCount: number
  visitDays: number
  lastVisit: string
}

export interface Achievement {
  id: string
  name: string
  emoji: string
  desc: string
  reached: (s: StatsData) => boolean
}

const STATS_KEY = 'cc_stats'
const BADGE_KEY = 'cc_badges'

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-vote', name: '첫 한 표', emoji: '🍽', desc: '처음으로 메뉴에 투표', reached: (s) => s.voteTicks > 0 },
  { id: 'first-attack', name: '첫 공격', emoji: '💥', desc: '처음으로 라이벌을 공격', reached: (s) => s.attackTicks > 0 },
  { id: 'gourmet', name: '미식가', emoji: '😋', desc: '누적 +100.0표 키우기', reached: (s) => s.voteTenths >= 1000 },
  { id: 'destroyer', name: '행성 파괴자', emoji: '☄️', desc: '누적 100.0표 깎기', reached: (s) => s.attackTenths >= 1000 },
  { id: 'combo-master', name: '콤보 마스터', emoji: '🔥', desc: '콤보 50 달성', reached: (s) => s.bestCombo >= 50 },
  { id: 'regular', name: '단골', emoji: '📅', desc: '3일 방문', reached: (s) => s.visitDays >= 3 },
  { id: 'full-course', name: '풀코스', emoji: '🍱', desc: '10가지 메뉴에 투표', reached: (s) => s.menusVoted.length >= 10 },
  { id: 'influencer', name: '점심 인플루언서', emoji: '📣', desc: '전황을 공유', reached: (s) => s.sharedCount > 0 },
]

function load(): StatsData {
  let raw: Partial<StatsData> = {}
  try {
    raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}')
  } catch {
    /* ignore */
  }
  return {
    voteTenths: raw.voteTenths ?? 0,
    attackTenths: raw.attackTenths ?? 0,
    voteTicks: raw.voteTicks ?? 0,
    attackTicks: raw.attackTicks ?? 0,
    bestCombo: raw.bestCombo ?? 0,
    menusVoted: raw.menusVoted ?? [],
    sharedCount: raw.sharedCount ?? 0,
    visitDays: raw.visitDays ?? 0,
    lastVisit: raw.lastVisit ?? '',
  }
}

class Stats {
  private data = load()
  private unlocked = new Set<string>(this.loadBadges())
  private listeners = new Set<(a: Achievement) => void>()

  private loadBadges(): string[] {
    try {
      return JSON.parse(localStorage.getItem(BADGE_KEY) ?? '[]')
    } catch {
      return []
    }
  }

  private persist() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.data))
      localStorage.setItem(BADGE_KEY, JSON.stringify([...this.unlocked]))
    } catch {
      /* private mode — best effort */
    }
    this.checkUnlocks()
  }

  private checkUnlocks() {
    for (const a of ACHIEVEMENTS) {
      if (!this.unlocked.has(a.id) && a.reached(this.data)) {
        this.unlocked.add(a.id)
        try {
          localStorage.setItem(BADGE_KEY, JSON.stringify([...this.unlocked]))
        } catch {
          /* ignore */
        }
        this.listeners.forEach((fn) => fn(a))
      }
    }
  }

  recordVote(tenths: number) {
    this.data.voteTenths += tenths
    this.data.voteTicks += 1
    this.persist()
  }

  recordAttack(tenths: number) {
    this.data.attackTenths += tenths
    this.data.attackTicks += 1
    this.persist()
  }

  recordCombo(n: number) {
    if (n > this.data.bestCombo) {
      this.data.bestCombo = n
      this.persist()
    }
  }

  recordMenu(slug: string) {
    if (!this.data.menusVoted.includes(slug)) {
      this.data.menusVoted.push(slug)
      this.persist()
    }
  }

  recordShare() {
    this.data.sharedCount += 1
    this.persist()
  }

  markVisit() {
    const today = new Date().toISOString().slice(0, 10)
    if (this.data.lastVisit !== today) {
      this.data.visitDays += 1
      this.data.lastVisit = today
      this.persist()
    }
  }

  snapshot(): StatsData {
    return { ...this.data, menusVoted: [...this.data.menusVoted] }
  }

  achievements(): Achievement[] {
    return ACHIEVEMENTS
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id)
  }

  onUnlock(fn: (a: Achievement) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const stats = new Stats()
