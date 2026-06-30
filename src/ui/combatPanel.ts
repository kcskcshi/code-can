import type { Backend } from '../types'
import type { Store } from '../store'
import { el, rafThrottle } from './dom'
import { fmtVotes } from './format'
import { stats } from '../stats'

const FLUSH_MS = 300 // batch rapid auto-fire ticks into one network call

export interface CombatController {
  /** Hold a rival planet → attack tick. `amount` is tenths (ramps with combo). */
  onAttack(target: string, amount: number): void
  /** Hold your own planet → vote tick. `amount` is tenths (ramps with combo). */
  onVote(target: string, amount: number): void
}

/**
 * Combat HUD: pick your menu, then press-and-hold planets on the battlefield —
 * your own to grow it (vote), a rival to smash it (attack). Both are unlimited;
 * rapid ticks are batched into one network call every FLUSH_MS.
 */
export function mountCombatHud(
  root: HTMLElement,
  store: Store,
  backend: Backend,
): CombatController {
  const champSelect = el('select', {
    class: 'combat-champion',
    'aria-label': '내 메뉴 선택',
  }) as HTMLSelectElement
  const status = el('p', {
    class: 'combat-status',
    text: '내 행성=꾹 눌러 키우기(+) · 적 행성=꾹 눌러 부수기(−) · 무제한',
  })

  root.append(
    el('div', { class: 'hud' }, [
      el('label', { class: 'hud-champion' }, [
        el('span', { class: 'hud-label', text: '🍽 내 메뉴' }),
        champSelect,
      ]),
      el('div', { class: 'hud-mid' }, [status]),
    ]),
  )

  function setStatus(msg: string, kind: 'info' | 'ok' | 'err' = 'info') {
    status.textContent = msg
    status.dataset.kind = kind
  }

  champSelect.addEventListener('change', () => store.setChampion(champSelect.value))

  // pending damage (tenths) per target, flushed on an interval
  let pendingSlug: string | null = null
  let pendingAmt = 0
  let flushing = false

  async function flush() {
    if (flushing || pendingAmt <= 0 || !pendingSlug) return
    const champion = store.getChampion()
    if (!champion || champion === pendingSlug) {
      pendingAmt = 0
      pendingSlug = null
      return
    }
    const target = pendingSlug
    const amount = pendingAmt
    pendingAmt = 0
    flushing = true
    try {
      const res = await backend.attack(target, champion, null, amount)
      if (res.ok) {
        // authoritative total → updates the orb + one feed entry per flush
        store.applyVote(
          { slug: target, total: res.total, amount, kind: 'attack' },
          true,
        )
        const name = store.get(target)?.name ?? target
        setStatus(`${name} 강타! 💥 (현재 ${fmtVotes(res.total)})`, 'ok')
      } else {
        setStatus(`공격 실패: ${res.error}`, 'err')
      }
    } catch {
      setStatus('공격 실패: 네트워크 오류', 'err')
    } finally {
      flushing = false
    }
  }

  // pending votes (tenths) for your own planet, flushed the same way
  let pendingVoteSlug: string | null = null
  let pendingVoteAmt = 0
  let flushingVote = false

  async function flushVote() {
    if (flushingVote || pendingVoteAmt <= 0 || !pendingVoteSlug) return
    const target = pendingVoteSlug
    const amount = pendingVoteAmt
    pendingVoteAmt = 0
    flushingVote = true
    try {
      const res = await backend.vote(target, null, amount)
      if (res.ok) {
        store.applyVote({ slug: target, total: res.total, amount, kind: 'vote' }, true)
        const name = store.get(target)?.name ?? target
        setStatus(`${name} 키우는 중! 🍽 (현재 ${fmtVotes(res.total)})`, 'ok')
      } else {
        setStatus(`투표 실패: ${res.error}`, 'err')
      }
    } catch {
      setStatus('투표 실패: 네트워크 오류', 'err')
    } finally {
      flushingVote = false
    }
  }

  window.setInterval(() => {
    void flush()
    void flushVote()
  }, FLUSH_MS)

  function onAttack(target: string, amount: number) {
    const champion = store.getChampion()
    if (!champion || champion === target) return
    // switching targets mid-stream: flush the previous one first
    if (pendingSlug && pendingSlug !== target && pendingAmt > 0) void flush()
    pendingSlug = target
    pendingAmt += Math.max(1, amount)
    stats.recordAttack(Math.max(1, amount))
  }

  function onVote(target: string, amount: number) {
    if (pendingVoteSlug && pendingVoteSlug !== target && pendingVoteAmt > 0) void flushVote()
    pendingVoteSlug = target
    pendingVoteAmt += Math.max(1, amount)
    stats.recordVote(Math.max(1, amount))
    stats.recordMenu(target)
  }

  const renderChampion = rafThrottle(() => {
    const ranked = store.ranked()
    const champ = store.getChampion()
    champSelect.replaceChildren(
      ...ranked.map((l) =>
        el('option', { value: l.slug, text: l.name, selected: l.slug === champ }),
      ),
    )
    if (champ) champSelect.value = champ
  })

  store.onChange(renderChampion)
  store.onChampionChange(renderChampion)
  renderChampion()

  return { onAttack, onVote }
}
