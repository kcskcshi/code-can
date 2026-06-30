import type { Backend } from '../types'
import type { Store } from '../store'
import { el, rafThrottle } from './dom'
import { fmtVotes } from './format'

const FLUSH_MS = 300 // batch rapid auto-fire ticks into one network call

export interface CombatController {
  /** Called on every auto-fire tick from the canvas (press-and-hold an enemy). */
  onAttack(target: string): void
}

/**
 * Combat HUD: pick your champion, then press-and-hold an enemy planet on the
 * battlefield to smash it. Attacking is unlimited; rapid ticks are batched into
 * one network call every FLUSH_MS to keep the server happy.
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
    text: '적 행성을 꾹 눌러 공격! 투표 +1.0 / 공격 −0.1 · 무제한',
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

  window.setInterval(flush, FLUSH_MS)

  function onAttack(target: string) {
    const champion = store.getChampion()
    if (!champion || champion === target) return
    // switching targets mid-stream: flush the previous one first
    if (pendingSlug && pendingSlug !== target && pendingAmt > 0) void flush()
    pendingSlug = target
    pendingAmt += 1
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

  return { onAttack }
}
