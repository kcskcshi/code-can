import type { Backend } from '../types'
import type { Store } from '../store'
import { el, rafThrottle } from './dom'

const COOLDOWN_MS = 12000
const ATTACK_DAMAGE = 3

export interface CombatController {
  /** Attempt an attack on a rival (called when the player clicks an enemy army). */
  tryAttack(target: string): void
}

/**
 * Combat HUD: pick your champion, then click an enemy army on the battlefield
 * to smash it. This panel only holds the champion selector, the cooldown bar
 * and status — the actual targeting happens on the canvas.
 */
export function mountCombatHud(
  root: HTMLElement,
  store: Store,
  backend: Backend,
): CombatController {
  const champSelect = el('select', {
    class: 'combat-champion',
    'aria-label': '내 군대 선택',
  }) as HTMLSelectElement
  const cooldownBar = el('span', { class: 'combat-cd-fill' })
  const cooldownWrap = el('span', { class: 'combat-cd' }, [cooldownBar])
  const status = el('p', {
    class: 'combat-status',
    text: '전장에서 적 진영을 클릭해 공격! (−3표 · 12초 쿨다운)',
  })

  root.append(
    el('div', { class: 'hud' }, [
      el('label', { class: 'hud-champion' }, [
        el('span', { class: 'hud-label', text: '⚔ 내 군대' }),
        champSelect,
      ]),
      el('div', { class: 'hud-mid' }, [status, cooldownWrap]),
    ]),
  )

  let cooldownUntil = 0

  function setStatus(msg: string, kind: 'info' | 'ok' | 'err' = 'info') {
    status.textContent = msg
    status.dataset.kind = kind
  }

  champSelect.addEventListener('change', () => store.setChampion(champSelect.value))

  function startCooldown(ms: number) {
    cooldownUntil = Date.now() + ms
    cooldownBar.style.transition = 'none'
    cooldownBar.style.width = '100%'
    void cooldownBar.offsetWidth // reflow so the next change animates
    cooldownBar.style.transition = `width ${ms}ms linear`
    cooldownBar.style.width = '0%'
  }

  async function tryAttack(target: string) {
    const now = Date.now()
    if (now < cooldownUntil) {
      const left = Math.ceil((cooldownUntil - now) / 1000)
      setStatus(`재정비 중… ${left}초 후 다시 공격할 수 있습니다.`, 'err')
      return
    }
    const champion = store.getChampion()
    if (!champion) return
    if (champion === target) {
      setStatus('자기 군대는 공격할 수 없습니다.', 'err')
      return
    }
    cooldownUntil = now + COOLDOWN_MS
    startCooldown(COOLDOWN_MS)

    const res = await backend.attack(target, champion, null)
    if (res.ok) {
      store.applyVote(
        { slug: target, total: res.total, amount: ATTACK_DAMAGE, kind: 'attack' },
        true,
      )
      store.emitAssault({ champion, target, amount: ATTACK_DAMAGE })
      const name = store.get(target)?.name ?? target
      setStatus(`${name} 진영을 강타! 💥 (−${ATTACK_DAMAGE}표)`, 'ok')
    } else {
      cooldownUntil = res.retryAfter ? now + res.retryAfter * 1000 : now
      if (res.retryAfter) startCooldown(res.retryAfter * 1000)
      else startCooldown(0)
      setStatus(
        res.retryAfter
          ? `너무 빠릅니다 — ${res.retryAfter}초 후 다시.`
          : `공격 실패: ${res.error}`,
        'err',
      )
    }
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

  return { tryAttack }
}
