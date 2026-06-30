import type { Store } from './store'
import type { Language } from './types'
import { BATTLE_SQUADS, MAX_SOLDIERS } from './config'

interface Soldier {
  /** grid slot, stable so soldiers don't jump around */
  col: number
  row: number
  /** spawn animation 0 -> 1 */
  spawn: number
  /** per-soldier phase so the march isn't in lockstep */
  phase: number
  /** brief attack lunge 0..1 */
  attack: number
}

interface Squad {
  slug: string
  name: string
  tag: string
  color: string
  votes: number
  rank: number
  soldiers: Soldier[]
  target: number
  /** white pulse on a vote */
  flash: number
  /** red pulse when hit by an attack */
  hitFlash: number
  x: number
  bob: number
}

interface FloatText {
  x: number
  y: number
  vy: number
  life: number
  text: string
  color: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

/** A soldier charging from the attacking army toward a defender (invasion FX). */
interface Raider {
  sx: number
  sy: number
  tx: number
  ty: number
  x: number
  y: number
  /** travel progress 0..1 */
  t: number
  dur: number
  color: string
}

/** A scheduled hit that lands when the raiders arrive (delays the defender's reaction). */
interface Impact {
  slug: string
  amount: number
  delay: number
}

const COLS = 6 // soldiers per row in a squad cluster
const RAID_DUR = 0.55 // seconds for a raider to cross to its target

export class BattleField {
  private ctx: CanvasRenderingContext2D
  private squads: Squad[] = []
  private floats: FloatText[] = []
  private particles: Particle[] = []
  private raiders: Raider[] = []
  private impacts: Impact[] = []
  private w = 0
  private h = 0
  private dpr = 1
  private last = 0
  private raf = 0
  private unsub: (() => void)[] = []
  private canvas: HTMLCanvasElement
  private store: Store

  constructor(canvas: HTMLCanvasElement, store: Store) {
    this.canvas = canvas
    this.store = store
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas not supported')
    this.ctx = ctx

    const ro = new ResizeObserver(() => this.resize())
    ro.observe(canvas.parentElement ?? canvas)
    this.unsub.push(() => ro.disconnect())

    this.unsub.push(this.store.onChange(() => this.syncSquads()))
    // Votes drive the cheer FX; attacks are visualised by the assault stream.
    this.unsub.push(
      this.store.onFx((e) => {
        if ((e.kind ?? 'vote') === 'vote') this.onVote(e.slug, e.self)
      }),
    )
    this.unsub.push(this.store.onAssault((a) => this.onAssault(a)))

    this.resize()
    this.syncSquads()
  }

  start() {
    const loop = (t: number) => {
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0.016
      this.last = t
      this.update(dt)
      this.draw(t / 1000)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.unsub.forEach((fn) => fn())
  }

  private resize() {
    const parent = this.canvas.parentElement
    const cssW = parent?.clientWidth ?? 960
    const cssH = Math.min(360, Math.max(240, Math.round(cssW * 0.32)))
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(cssW * this.dpr)
    this.canvas.height = Math.round(cssH * this.dpr)
    this.canvas.style.height = `${cssH}px`
    this.w = cssW
    this.h = cssH
    this.layout()
  }

  /** Reconcile the squad list with the current top-N leaderboard. */
  private syncSquads() {
    const top = this.store.ranked().slice(0, BATTLE_SQUADS)
    const leaderVotes = top[0]?.votes ?? 1
    const next: Squad[] = top.map((lang, i) => {
      const existing = this.squads.find((s) => s.slug === lang.slug)
      const target = soldierTarget(lang, leaderVotes)
      if (existing) {
        existing.votes = lang.votes
        existing.rank = i
        existing.target = target
        return existing
      }
      return {
        slug: lang.slug,
        name: lang.name,
        tag: lang.tag,
        color: lang.color,
        votes: lang.votes,
        rank: i,
        soldiers: [],
        target,
        flash: 0,
        hitFlash: 0,
        x: 0,
        bob: Math.random() * Math.PI * 2,
      }
    })
    this.squads = next
    this.layout()
  }

  private layout() {
    const n = this.squads.length || 1
    const slot = this.w / n
    this.squads.forEach((s, i) => {
      s.x = slot * (i + 0.5)
    })
  }

  private onVote(slug: string, self: boolean) {
    const s = this.squads.find((sq) => sq.slug === slug)
    if (!s) return
    s.flash = 1
    // make a few soldiers lunge
    for (const sol of s.soldiers) {
      if (Math.random() < 0.4) sol.attack = 1
    }
    const groundY = this.h - 26
    this.floats.push({
      x: s.x,
      y: groundY - 96,
      vy: -26,
      life: 1.2,
      text: self ? '+1 YOU!' : '+1',
      color: s.color,
    })
    const burst = self ? 18 : 9
    for (let i = 0; i < burst; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 30 + Math.random() * 70
      this.particles.push({
        x: s.x,
        y: groundY - 40,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 0.6 + Math.random() * 0.4,
        color: s.color,
      })
    }
  }

  /** Launch an invasion: raiders charge from the attacker to the defender. The
   * defender's reaction (red flash, falling soldiers, "-N") lands on arrival. */
  private onAssault(a: { champion: string; target: string; amount: number }) {
    const targetSq = this.squads.find((sq) => sq.slug === a.target)
    if (!targetSq) return // off-screen target — nothing to animate
    const groundY = this.h - 26
    const tx = targetSq.x
    const ty = groundY - 30
    const champ = this.squads.find((sq) => sq.slug === a.champion)
    // Charge from the champion army if it's on screen, else from the near edge.
    const sx = champ ? champ.x : tx < this.w / 2 ? -20 : this.w + 20
    const sy = groundY - 30
    const color = champ?.color ?? '#ffffff'
    const n = 5
    for (let i = 0; i < n; i++) {
      this.raiders.push({
        sx,
        sy: sy - (i % 3) * 4,
        tx: tx + (i - 2) * 5,
        ty,
        x: sx,
        y: sy,
        t: -i * 0.06, // slight stagger so they don't overlap perfectly
        dur: RAID_DUR,
        color,
      })
    }
    this.impacts.push({ slug: a.target, amount: a.amount, delay: RAID_DUR * 0.9 })
  }

  /** Resolve a landed assault on the defender squad. */
  private applyImpact(im: Impact) {
    const s = this.squads.find((sq) => sq.slug === im.slug)
    if (!s) return
    s.hitFlash = 1
    // knock a few defenders backward (negative lunge)
    for (const sol of s.soldiers) {
      if (Math.random() < 0.5) sol.attack = -1
    }
    const groundY = this.h - 26
    this.floats.push({
      x: s.x,
      y: groundY - 96,
      vy: -26,
      life: 1.3,
      text: `-${im.amount}`,
      color: '#ff6b8a',
    })
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 40 + Math.random() * 90
      this.particles.push({
        x: s.x,
        y: groundY - 40,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.5 + Math.random() * 0.4,
        color: i % 2 ? '#ff6b8a' : '#ffffff',
      })
    }
  }

  private update(dt: number) {
    for (const s of this.squads) {
      s.flash = Math.max(0, s.flash - dt * 2.5)
      s.hitFlash = Math.max(0, s.hitFlash - dt * 2.5)
      s.bob += dt
      // grow/shrink the army toward its target a little each frame
      if (s.soldiers.length < s.target) {
        const idx = s.soldiers.length
        s.soldiers.push({
          col: idx % COLS,
          row: Math.floor(idx / COLS),
          spawn: 0,
          phase: Math.random() * Math.PI * 2,
          attack: 0,
        })
      } else if (s.soldiers.length > s.target) {
        s.soldiers.pop()
      }
      for (const sol of s.soldiers) {
        if (sol.spawn < 1) sol.spawn = Math.min(1, sol.spawn + dt * 4)
        // lunge decays toward 0 from either side (+ = attack, - = knockback)
        if (sol.attack !== 0) {
          const d = dt * 3
          sol.attack = sol.attack > 0 ? Math.max(0, sol.attack - d) : Math.min(0, sol.attack + d)
        }
        sol.phase += dt * 6
      }
    }

    // raiders charge along an arc toward their target
    this.raiders = this.raiders.filter((r) => r.t < 1)
    for (const r of this.raiders) {
      r.t = Math.min(1, r.t + dt / r.dur)
      const p = Math.max(0, r.t)
      r.x = r.sx + (r.tx - r.sx) * p
      r.y = r.sy + (r.ty - r.sy) * p - Math.sin(p * Math.PI) * 26
    }

    // landed assaults resolve after their travel delay
    this.impacts = this.impacts.filter((im) => {
      im.delay -= dt
      if (im.delay > 0) return true
      this.applyImpact(im)
      return false
    })

    this.floats = this.floats.filter((f) => (f.life -= dt) > 0)
    for (const f of this.floats) {
      f.y += f.vy * dt
      f.vy += 8 * dt
    }
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0)
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 180 * dt
    }
  }

  private draw(time: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    ctx.imageSmoothingEnabled = false
    this.drawBackground(time)

    const groundY = this.h - 26
    // draw squads sorted so leftmost paints first (no real depth needed)
    for (const s of this.squads) this.drawSquad(s, groundY)

    // charging raiders ride above the armies
    for (const r of this.raiders) {
      if (r.t < 0) continue
      drawRaider(ctx, Math.round(r.x), Math.round(r.y), r.color)
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2))
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3)
    }
    ctx.globalAlpha = 1

    ctx.textAlign = 'center'
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life))
      ctx.font = '10px "Press Start 2P", monospace'
      ctx.fillStyle = '#0a0a12'
      ctx.fillText(f.text, f.x + 1, f.y + 1)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x, f.y)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  private drawBackground(time: number) {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, 0, 0, this.h)
    g.addColorStop(0, '#161324')
    g.addColorStop(0.6, '#1d1830')
    g.addColorStop(1, '#0c0a16')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.w, this.h)

    // parallax stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < 40; i++) {
      const x = (i * 71 + Math.sin(time * 0.2 + i) * 4) % this.w
      const y = (i * 37) % (this.h - 70)
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(time + i)
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2)
    }
    ctx.globalAlpha = 1

    // ground
    const groundY = this.h - 26
    ctx.fillStyle = '#241d33'
    ctx.fillRect(0, groundY, this.w, this.h - groundY)
    ctx.fillStyle = '#322848'
    for (let x = 0; x < this.w; x += 8) ctx.fillRect(x, groundY, 4, 3)
  }

  private drawSquad(s: Squad, groundY: number) {
    const ctx = this.ctx
    const u = 3 // pixel unit for soldiers
    const soldierW = 6 * u
    const clusterW = COLS * (soldierW + 4)
    const startX = s.x - clusterW / 2 + soldierW / 2

    // soldiers (back rows first)
    const ordered = [...s.soldiers].sort((a, b) => a.row - b.row)
    for (const sol of ordered) {
      const gx = startX + sol.col * (soldierW + 4)
      const gy = groundY - 8 - sol.row * 10
      const pop = easeOut(sol.spawn)
      const bob = Math.sin(sol.phase) * 1.5
      const lunge = sol.attack * 6
      drawSoldier(ctx, Math.round(gx + lunge), Math.round(gy + bob), u, s.color, pop, sol)
    }

    // flash overlay — white on a vote, red when hit by an attack
    if (s.flash > 0) {
      ctx.globalAlpha = s.flash * 0.5
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(s.x - clusterW / 2 - 4), groundY - 80, clusterW + 8, 86)
      ctx.globalAlpha = 1
    }
    if (s.hitFlash > 0) {
      ctx.globalAlpha = s.hitFlash * 0.55
      ctx.fillStyle = '#ff3b5c'
      ctx.fillRect(Math.round(s.x - clusterW / 2 - 4), groundY - 80, clusterW + 8, 86)
      ctx.globalAlpha = 1
    }

    // banner — anchored just above this squad's army so flag and troops read as one unit
    const rows = Math.ceil(Math.max(1, s.target) / COLS)
    const armyTopY = groundY - 8 - rows * 10
    const bannerY = Math.max(8, armyTopY - 34) + Math.sin(s.bob) * 2
    const isLeader = s.rank === 0
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'

    // pole (reaches down to the army) + flag
    ctx.fillStyle = '#0d0a18'
    ctx.fillRect(Math.round(s.x - 1), Math.round(bannerY), 2, Math.max(20, armyTopY - bannerY))
    ctx.fillStyle = s.color
    ctx.fillRect(Math.round(s.x), Math.round(bannerY), 34, 14)
    ctx.fillStyle = shade(s.color, -0.5)
    ctx.fillRect(Math.round(s.x), Math.round(bannerY + 14), 34, 2)
    ctx.fillStyle = pickText(s.color)
    ctx.fillText(s.tag, Math.round(s.x + 17), Math.round(bannerY + 11))

    // crown for the leader
    if (isLeader) {
      ctx.fillStyle = '#ffd34d'
      const cx = Math.round(s.x - 1)
      ctx.fillRect(cx - 8, Math.round(bannerY - 10), 18, 5)
      ctx.fillRect(cx - 8, Math.round(bannerY - 14), 3, 5)
      ctx.fillRect(cx - 1, Math.round(bannerY - 16), 3, 7)
      ctx.fillRect(cx + 6, Math.round(bannerY - 14), 3, 5)
    }

    // vote count under the army
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.fillStyle = '#0a0a12'
    ctx.fillText(String(s.votes), Math.round(s.x + 1), groundY + 19)
    ctx.fillStyle = isLeader ? '#ffd34d' : '#cbb8ff'
    ctx.fillText(String(s.votes), Math.round(s.x), groundY + 18)
  }
}

function soldierTarget(lang: Language, leaderVotes: number): number {
  if (leaderVotes <= 0) return 1
  return Math.max(1, Math.round((lang.votes / leaderVotes) * MAX_SOLDIERS))
}

/** Draw one ~6x9-unit pixel soldier, feet at (cx,baseY), tinted `color`. */
function drawSoldier(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  u: number,
  color: string,
  pop: number,
  sol: Soldier,
) {
  if (pop <= 0) return
  ctx.save()
  ctx.globalAlpha = pop
  const left = cx - 3 * u
  const dark = shade(color, -0.45)
  const step = Math.sin(sol.phase) > 0 ? 1 : 0

  // helmet
  ctx.fillStyle = dark
  ctx.fillRect(left + 1 * u, baseY - 9 * u, 4 * u, 1 * u)
  // head
  ctx.fillStyle = '#f2c79a'
  ctx.fillRect(left + 1 * u, baseY - 8 * u, 4 * u, 2 * u)
  // body (armor)
  ctx.fillStyle = color
  ctx.fillRect(left + 1 * u, baseY - 6 * u, 4 * u, 3 * u)
  // belt
  ctx.fillStyle = dark
  ctx.fillRect(left + 1 * u, baseY - 3 * u, 4 * u, 1 * u)
  // legs (alternating march)
  ctx.fillStyle = dark
  ctx.fillRect(left + 1 * u, baseY - 2 * u, 1.5 * u, 2 * u + step * u)
  ctx.fillRect(left + 3.5 * u, baseY - 2 * u, 1.5 * u, 2 * u + (1 - step) * u)
  // spear
  ctx.fillStyle = '#d7d2e6'
  ctx.fillRect(left + 5 * u, baseY - 10 * u, 1, 8 * u)
  ctx.fillStyle = '#fff'
  ctx.fillRect(left + 5 * u - 1, baseY - 10 * u, 3, 1 * u)
  ctx.restore()
}

/** A small charging soldier for the invasion animation (feet near x,y). */
function drawRaider(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = shade(color, -0.4)
  ctx.fillRect(x - 3, y - 9, 6, 2) // helmet
  ctx.fillStyle = '#f2c79a'
  ctx.fillRect(x - 3, y - 7, 6, 3) // head
  ctx.fillStyle = color
  ctx.fillRect(x - 3, y - 4, 6, 5) // body
  ctx.fillStyle = shade(color, -0.4)
  ctx.fillRect(x - 3, y + 1, 2, 2) // legs
  ctx.fillRect(x + 1, y + 1, 2, 2)
  ctx.fillStyle = '#d7d2e6'
  ctx.fillRect(x + 3, y - 11, 1, 10) // spear (forward)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x + 3, y - 11, 3, 1) // spear tip
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

function pickText(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  // luminance check for readable banner text
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1430' : '#fff'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '')
  const n =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  const int = parseInt(n, 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}
