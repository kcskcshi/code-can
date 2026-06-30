import type { Store } from './store'
import type { Language } from './types'
import { BATTLE_SQUADS } from './config'
import { fmtVotes } from './ui/format'

/** A cute little eater orbiting a menu planet (Walkr-ish ambient life). */
interface Creature {
  /** base orbit angle */
  angle: number
  /** spawn animation 0 -> 1 */
  spawn: number
  /** bob phase */
  phase: number
  /** scatter-on-hit 0..1 */
  hit: number
}

/** One menu contender, drawn as a floating planet with a face. */
interface Body {
  slug: string
  name: string
  tag: string
  color: string
  emoji: string
  votes: number
  rank: number
  creatures: Creature[]
  target: number
  /** white pop on a vote (0..1) */
  bounce: number
  /** red shudder when hit (0..1) */
  hitFlash: number
  /** lingering cracks from being smashed (0..1) */
  crack: number
  x: number
  cy: number
  r: number
  bob: number
}

interface FloatText {
  x: number
  y: number
  vy: number
  life: number
  text: string
  color: string
  small?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  size?: number
  /** gravity multiplier (coins fall, sparks float) */
  grav?: number
}

interface Ring {
  x: number
  y: number
  r: number
  life: number
  color: string
}

/** A comet streaking from the attacker toward a defender (strike FX). */
interface Raider {
  sx: number
  sy: number
  tx: number
  ty: number
  x: number
  y: number
  t: number
  dur: number
  color: string
}

interface Impact {
  slug: string
  amount: number
  delay: number
}

const MAX_CREATURES = 10
const RAID_DUR = 0.5
const FIRE_INTERVAL = 0.1 // seconds between auto-fire ticks while held

export class BattleField {
  private ctx: CanvasRenderingContext2D
  private bodies: Body[] = []
  private floats: FloatText[] = []
  private particles: Particle[] = []
  private raiders: Raider[] = []
  private impacts: Impact[] = []
  private rings: Ring[] = []
  private w = 0
  private h = 0
  private dpr = 1
  private last = 0
  private raf = 0
  private shake = 0
  private hovered: string | null = null
  private firing: string | null = null
  private fireAccum = 0
  private onAttack: ((slug: string) => void) | null = null
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

    this.unsub.push(this.store.onChange(() => this.syncBodies()))
    // Votes drive the cheer FX; attacks are visualised by the assault stream.
    this.unsub.push(
      this.store.onFx((e) => {
        if ((e.kind ?? 'vote') === 'vote') this.onVote(e.slug, e.self)
      }),
    )
    this.unsub.push(this.store.onAssault((a) => this.onAssault(a)))

    // Hover highlights a target; press-and-hold an enemy planet to auto-fire.
    const onMove = (e: MouseEvent) => {
      const { x, y } = this.toCanvas(e)
      const b = this.bodyAt(x, y)
      this.hovered = b?.slug ?? null
      const champ = this.store.getChampion()
      this.canvas.style.cursor = !b
        ? 'default'
        : b.slug === champ
          ? 'not-allowed'
          : 'crosshair'
    }
    const onDown = (e: MouseEvent) => {
      const { x, y } = this.toCanvas(e)
      const b = this.bodyAt(x, y)
      if (!b || b.slug === this.store.getChampion()) return
      // fire once immediately, then keep firing while held
      this.firing = b.slug
      this.fireAccum = 0
      this.localHit(b.slug)
      this.onAttack?.(b.slug)
    }
    const stop = () => {
      this.firing = null
    }
    this.canvas.addEventListener('mousemove', onMove)
    this.canvas.addEventListener('mouseleave', () => {
      this.hovered = null
      this.canvas.style.cursor = 'default'
      stop()
    })
    this.canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', stop)
    this.unsub.push(() => {
      this.canvas.removeEventListener('mousemove', onMove)
      this.canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', stop)
    })

    this.resize()
    this.syncBodies()
  }

  /** Register the handler invoked on each attack tick against an enemy planet. */
  onAttackTarget(fn: (slug: string) => void) {
    this.onAttack = fn
  }

  private toCanvas(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const sx = rect.width ? this.w / rect.width : 1
    const sy = rect.height ? this.h / rect.height : 1
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  /** Hit-test a point to a planet by distance to its (current) centre. */
  private bodyAt(px: number, py: number): Body | null {
    for (const b of this.bodies) {
      const dx = px - b.x
      const dy = py - b.cy
      if (dx * dx + dy * dy <= (b.r + 10) * (b.r + 10)) return b
    }
    return null
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
    const cssH = Math.min(460, Math.max(300, Math.round(cssW * 0.4)))
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(cssW * this.dpr)
    this.canvas.height = Math.round(cssH * this.dpr)
    this.canvas.style.height = `${cssH}px`
    this.w = cssW
    this.h = cssH
    this.layout()
  }

  /** Reconcile the planet list with the current top-N leaderboard. */
  private syncBodies() {
    const top = this.store.ranked().slice(0, BATTLE_SQUADS)
    const leaderVotes = top[0]?.votes ?? 1
    const next: Body[] = top.map((lang, i) => {
      const existing = this.bodies.find((b) => b.slug === lang.slug)
      const target = creatureTarget(lang, leaderVotes)
      if (existing) {
        existing.votes = lang.votes
        existing.rank = i
        existing.target = target
        existing.name = lang.name
        existing.tag = lang.tag
        existing.color = lang.color
        existing.emoji = lang.emoji ?? '🍽'
        return existing
      }
      return {
        slug: lang.slug,
        name: lang.name,
        tag: lang.tag,
        color: lang.color,
        emoji: lang.emoji ?? '🍽',
        votes: lang.votes,
        rank: i,
        creatures: [],
        target,
        bounce: 0,
        hitFlash: 0,
        crack: 0,
        x: 0,
        cy: 0,
        r: 16,
        bob: Math.random() * Math.PI * 2,
      }
    })
    this.bodies = next
    this.layout()
  }

  private layout() {
    const n = this.bodies.length || 1
    const slot = this.w / n
    const leaderVotes = this.bodies[0]?.votes ?? 1
    this.bodies.forEach((b, i) => {
      b.x = slot * (i + 0.5)
      b.cy = this.h * 0.46
      b.r = planetRadius(b.votes, leaderVotes, slot)
    })
  }

  private onVote(slug: string, self: boolean) {
    const b = this.bodies.find((bb) => bb.slug === slug)
    if (!b) return
    b.bounce = 1
    this.floats.push({
      x: b.x,
      y: b.cy - b.r - 16,
      vy: -26,
      life: 1.1,
      text: self ? '+1.0 😋' : '+1.0',
      color: b.color,
    })
    const burst = self ? 14 : 8
    for (let i = 0; i < burst; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 30 + Math.random() * 60
      this.particles.push({
        x: b.x,
        y: b.cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.4,
        color: i % 2 ? '#fff7c2' : b.color,
        grav: -0.2, // sparkles drift up
      })
    }
  }

  /** Local feedback for one of *my* auto-fire ticks (no data side effects). */
  private localHit(slug: string) {
    const b = this.bodies.find((bb) => bb.slug === slug)
    if (!b) return
    b.hitFlash = Math.min(1, b.hitFlash + 0.6)
    b.crack = 1
    this.shake = Math.min(7, this.shake + 1.4)
    for (const c of b.creatures) if (Math.random() < 0.5) c.hit = 1
    // gold coins + crumbs flying off
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
      const sp = 60 + Math.random() * 90
      this.particles.push({
        x: b.x + (Math.random() - 0.5) * b.r,
        y: b.cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.4,
        color: i % 2 ? '#ffd34d' : shade(b.color, 0.1),
        size: 3 + Math.floor(Math.random() * 2),
        grav: 1,
      })
    }
    this.floats.push({
      x: b.x + (Math.random() - 0.5) * b.r,
      y: b.cy - b.r,
      vy: -34,
      life: 0.6,
      text: '−0.1',
      color: '#ff6b8a',
      small: true,
    })
  }

  /** A remote (or batched) strike: a comet streaks in, then the planet shatters. */
  private onAssault(a: { champion: string; target: string; amount: number }) {
    const target = this.bodies.find((b) => b.slug === a.target)
    if (!target) return
    const tx = target.x
    const ty = target.cy
    const champ = this.bodies.find((b) => b.slug === a.champion)
    const sx = champ ? champ.x : tx < this.w / 2 ? -20 : this.w + 20
    const sy = champ ? champ.cy : ty
    const color = champ?.color ?? '#fff7c2'
    const n = 3
    for (let i = 0; i < n; i++) {
      this.raiders.push({
        sx,
        sy: sy - (i % 3) * 5,
        tx: tx + (i - 1) * 6,
        ty,
        x: sx,
        y: sy,
        t: -i * 0.05,
        dur: RAID_DUR,
        color,
      })
    }
    this.impacts.push({ slug: a.target, amount: a.amount, delay: RAID_DUR * 0.9 })
  }

  /** A landed strike — coins, crumbs, cracks, shockwave. Scales with amount. */
  private applyImpact(im: Impact) {
    const b = this.bodies.find((bb) => bb.slug === im.slug)
    if (!b) return
    b.hitFlash = 1
    b.crack = 1
    const power = Math.min(3, 1 + im.amount / 5)
    this.shake = Math.min(11, this.shake + 5 * power)
    for (const c of b.creatures) c.hit = 1

    this.rings.push({ x: b.x, y: b.cy, r: b.r * 0.6, life: 0.5, color: '#ffd34d' })
    const coins = Math.round(14 * power)
    for (let i = 0; i < coins; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 60 + Math.random() * 150
      this.particles.push({
        x: b.x,
        y: b.cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.6 + Math.random() * 0.5,
        color: i % 3 === 0 ? '#ffd34d' : i % 3 === 1 ? '#fff' : shade(b.color, 0.05),
        size: 3 + Math.floor(Math.random() * 3),
        grav: 1,
      })
    }
    this.floats.push({
      x: b.x,
      y: b.cy - b.r - 14,
      vy: -30,
      life: 1.3,
      text: `−${fmtVotes(im.amount)}`,
      color: '#ff6b8a',
    })
  }

  private update(dt: number) {
    // auto-fire while a planet is held down
    if (this.firing) {
      const champ = this.store.getChampion()
      const stillThere = this.bodies.some((b) => b.slug === this.firing)
      if (!stillThere || this.firing === champ) {
        this.firing = null
      } else {
        this.fireAccum += dt
        while (this.fireAccum >= FIRE_INTERVAL) {
          this.fireAccum -= FIRE_INTERVAL
          this.localHit(this.firing)
          this.onAttack?.(this.firing)
        }
      }
    }

    const leaderVotes = this.bodies[0]?.votes ?? 1
    const slot = this.w / (this.bodies.length || 1)
    for (const b of this.bodies) {
      b.bounce = Math.max(0, b.bounce - dt * 3)
      b.hitFlash = Math.max(0, b.hitFlash - dt * 3)
      b.crack = Math.max(0, b.crack - dt * 1.2)
      b.bob += dt
      // ease the radius toward its target so growth/shrink is smooth
      const targetR = planetRadius(b.votes, leaderVotes, slot)
      b.r += (targetR - b.r) * Math.min(1, dt * 6)
      b.cy = this.h * 0.46

      if (b.creatures.length < b.target) {
        b.creatures.push({
          angle: Math.random() * Math.PI * 2,
          spawn: 0,
          phase: Math.random() * Math.PI * 2,
          hit: 0,
        })
      } else if (b.creatures.length > b.target) {
        b.creatures.pop()
      }
      for (const c of b.creatures) {
        if (c.spawn < 1) c.spawn = Math.min(1, c.spawn + dt * 3)
        if (c.hit > 0) c.hit = Math.max(0, c.hit - dt * 2)
        c.phase += dt * 4
        c.angle += dt * 0.5
      }
    }

    this.raiders = this.raiders.filter((r) => r.t < 1)
    for (const r of this.raiders) {
      r.t = Math.min(1, r.t + dt / r.dur)
      const p = Math.max(0, r.t)
      r.x = r.sx + (r.tx - r.sx) * p
      r.y = r.sy + (r.ty - r.sy) * p - Math.sin(p * Math.PI) * 30
    }

    this.impacts = this.impacts.filter((im) => {
      im.delay -= dt
      if (im.delay > 0) return true
      this.applyImpact(im)
      return false
    })

    this.floats = this.floats.filter((f) => (f.life -= dt) > 0)
    for (const f of this.floats) {
      f.y += f.vy * dt
      f.vy += 10 * dt
    }
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0)
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 200 * (p.grav ?? 1) * dt
    }

    this.shake = Math.max(0, this.shake - dt * 24)
    this.rings = this.rings.filter((r) => (r.life -= dt) > 0)
    for (const r of this.rings) r.r += dt * 240
  }

  private draw(time: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    ctx.imageSmoothingEnabled = false
    if (this.shake > 0.2) {
      const k = this.shake
      ctx.translate(Math.round(Math.sin(time * 91) * k), Math.round(Math.cos(time * 73) * k))
    }
    this.drawBackground(time)

    const champion = this.store.getChampion()
    for (const b of this.bodies) this.drawBody(b, time, champion)

    for (const r of this.rings) {
      ctx.globalAlpha = Math.max(0, Math.min(1, r.life * 2))
      ctx.strokeStyle = r.color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    for (const r of this.raiders) {
      if (r.t < 0) continue
      drawComet(ctx, Math.round(r.x), Math.round(r.y), r.color)
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2))
      ctx.fillStyle = p.color
      const sz = p.size ?? 3
      ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz)
    }
    ctx.globalAlpha = 1

    ctx.textAlign = 'center'
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4))
      ctx.font = `${f.small ? 8 : 10}px "Press Start 2P", monospace`
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
    g.addColorStop(0, '#1a1330')
    g.addColorStop(0.55, '#16122a')
    g.addColorStop(1, '#0c0a16')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.w, this.h)

    // soft nebula blobs
    const neb = ctx.createRadialGradient(this.w * 0.3, this.h * 0.3, 10, this.w * 0.3, this.h * 0.3, this.w * 0.4)
    neb.addColorStop(0, 'rgba(124,92,255,0.10)')
    neb.addColorStop(1, 'rgba(124,92,255,0)')
    ctx.fillStyle = neb
    ctx.fillRect(0, 0, this.w, this.h)

    // distant parallax planets
    drawFarPlanet(ctx, this.w * 0.82, this.h * 0.22, 16, '#3a2d63')
    drawFarPlanet(ctx, this.w * 0.12, this.h * 0.7, 10, '#2c6b4a')

    // twinkling stars
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 50; i++) {
      const x = (i * 71 + Math.sin(time * 0.2 + i) * 4) % this.w
      const y = (i * 53) % this.h
      ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(time + i))
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2)
    }
    ctx.globalAlpha = 1
  }

  private drawBody(b: Body, time: number, champion: string | null) {
    const ctx = this.ctx
    const cx = Math.round(b.x)
    const cy = Math.round(b.cy + Math.sin(b.bob) * 3)
    const r = Math.round(b.r * (1 + b.bounce * 0.12))
    const isLeader = b.rank === 0

    // orbiting creatures behind the planet
    for (const c of b.creatures) {
      if (Math.sin(c.angle) >= 0) continue // back half
      drawCreature(ctx, b, c, cx, cy, r, time)
    }

    // planet body
    ctx.fillStyle = shade(b.color, -0.5)
    ctx.beginPath()
    ctx.arc(cx, cy + 2, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = b.color
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    // top highlight
    ctx.fillStyle = shade(b.color, 0.22)
    ctx.beginPath()
    ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.5, 0, Math.PI * 2)
    ctx.fill()

    // cracks when freshly hit
    if (b.crack > 0.05) {
      ctx.strokeStyle = `rgba(20,10,20,${0.5 * b.crack})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.4, cy - r * 0.5)
      ctx.lineTo(cx - r * 0.1, cy)
      ctx.lineTo(cx - r * 0.3, cy + r * 0.5)
      ctx.moveTo(cx + r * 0.1, cy - r * 0.4)
      ctx.lineTo(cx + r * 0.35, cy + r * 0.2)
      ctx.stroke()
    }

    // cute face
    const eyeY = cy - r * 0.08
    const ex = r * 0.36
    ctx.fillStyle = '#1a1024'
    const blink = Math.sin(time * 1.7 + b.bob) > 0.96
    if (blink) {
      ctx.fillRect(cx - ex - 2, eyeY, 4, 1)
      ctx.fillRect(cx + ex - 2, eyeY, 4, 1)
    } else {
      ctx.beginPath()
      ctx.arc(cx - ex, eyeY, Math.max(1.5, r * 0.09), 0, Math.PI * 2)
      ctx.arc(cx + ex, eyeY, Math.max(1.5, r * 0.09), 0, Math.PI * 2)
      ctx.fill()
      // sparkle
      ctx.fillStyle = '#fff'
      ctx.fillRect(Math.round(cx - ex - 1), Math.round(eyeY - 1), 1, 1)
      ctx.fillRect(Math.round(cx + ex - 1), Math.round(eyeY - 1), 1, 1)
    }
    // mouth: a smile, or an "ouch" when hit
    ctx.strokeStyle = '#1a1024'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const my = cy + r * 0.28
    if (b.hitFlash > 0.3) {
      ctx.arc(cx, my + r * 0.12, r * 0.16, Math.PI, Math.PI * 2) // open "o" frown
    } else {
      ctx.arc(cx, my - r * 0.1, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI)
    }
    ctx.stroke()

    // red hit tint
    if (b.hitFlash > 0) {
      ctx.globalAlpha = b.hitFlash * 0.5
      ctx.fillStyle = '#ff3b5c'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // orbiting creatures in front
    for (const c of b.creatures) {
      if (Math.sin(c.angle) < 0) continue
      drawCreature(ctx, b, c, cx, cy, r, time)
    }

    // selection / target ring
    if (b.slug === champion) {
      ctx.strokeStyle = '#ffd34d'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
      ctx.stroke()
    } else if (b.slug === this.hovered) {
      ctx.strokeStyle = '#ff6b8a'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.font = '8px "Press Start 2P", monospace'
      ctx.fillStyle = '#ff6b8a'
      ctx.fillText('공격!', cx, cy - r - 18)
    }

    // emoji badge above the planet
    ctx.font = '18px serif'
    ctx.textAlign = 'center'
    ctx.fillText(b.emoji, cx, cy - r - 4)

    // crown for the leader
    if (isLeader) {
      ctx.fillStyle = '#ffd34d'
      const yk = cy - r - 24
      ctx.fillRect(cx - 9, yk + 6, 18, 4)
      ctx.fillRect(cx - 9, yk, 3, 8)
      ctx.fillRect(cx - 1, yk - 2, 3, 10)
      ctx.fillRect(cx + 6, yk, 3, 8)
    }

    // name + votes below
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.fillStyle = '#0a0a12'
    ctx.fillText(b.name, cx + 1, cy + r + 17)
    ctx.fillStyle = isLeader ? '#ffd34d' : '#e9e4ff'
    ctx.fillText(b.name, cx, cy + r + 16)
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.fillStyle = isLeader ? '#ffd34d' : '#cbb8ff'
    ctx.fillText(fmtVotes(b.votes), cx, cy + r + 28)
  }
}

function creatureTarget(lang: Language, leaderVotes: number): number {
  if (leaderVotes <= 0) return 1
  return Math.max(1, Math.round((lang.votes / leaderVotes) * MAX_CREATURES))
}

function planetRadius(votes: number, leaderVotes: number, slot: number): number {
  const ratio = leaderVotes > 0 ? votes / leaderVotes : 0
  const maxR = Math.min(48, slot * 0.34)
  const minR = 13
  return minR + Math.sqrt(Math.max(0, ratio)) * (maxR - minR)
}

/** A tiny round eater orbiting a planet. */
function drawCreature(
  ctx: CanvasRenderingContext2D,
  b: Body,
  c: Creature,
  cx: number,
  cy: number,
  r: number,
  _time: number,
) {
  if (c.spawn <= 0) return
  const ox = r + 9 + c.hit * 18
  const oy = r * 0.55 + 5
  const x = Math.round(cx + Math.cos(c.angle) * ox)
  const y = Math.round(cy + Math.sin(c.angle) * oy + Math.sin(c.phase) * 2)
  const s = 4
  ctx.save()
  ctx.globalAlpha = c.spawn
  ctx.fillStyle = shade(b.color, 0.18)
  ctx.fillRect(x - s / 2, y - s / 2, s, s)
  ctx.fillStyle = '#1a1024'
  ctx.fillRect(x - 1, y - 1, 1, 1) // tiny eye
  ctx.restore()
}

/** A little comet head with a short tail. */
function drawComet(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.globalAlpha = 0.5
  ctx.fillStyle = color
  ctx.fillRect(x - 6, y - 1, 6, 2)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#fff7c2'
  ctx.fillRect(x - 2, y - 2, 4, 4)
  ctx.fillStyle = '#ffd34d'
  ctx.fillRect(x - 1, y - 1, 2, 2)
}

function drawFarPlanet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.globalAlpha = 0.5
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)))
  return `rgb(${f(r)},${f(g)},${f(b)})`
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
