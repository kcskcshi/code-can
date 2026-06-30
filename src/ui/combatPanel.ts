import type { Backend } from '../types'
import type { Store } from '../store'
import { el, rafThrottle } from './dom'

const COOLDOWN_MS = 12000
const RIVALS_SHOWN = 8
const ATTACK_DAMAGE = 3

/**
 * Combat booth: pick your champion army, then attack a rival to strip a few of
 * its votes. A shared cooldown keeps it from becoming a spam button; the server
 * also rate-limits per IP.
 */
export function mountCombatPanel(root: HTMLElement, store: Store, backend: Backend): void {
  const champSelect = el('select', {
    class: 'combat-champion',
    'aria-label': '내 군대 선택',
  }) as HTMLSelectElement
  const cooldownBar = el('span', { class: 'combat-cd-fill' })
  const cooldownWrap = el('span', { class: 'combat-cd' }, [cooldownBar])
  const list = el('ul', { class: 'combat-list' })
  const status = el('p', {
    class: 'combat-status',
    text: '내 군대를 고르고 라이벌을 공격하세요 ⚔',
  })

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '⚔ 전투 (Combat)' }),
      el('label', { class: 'combat-champion-row' }, [
        el('span', { class: 'combat-champion-label', text: '내 군대' }),
        champSelect,
      ]),
      cooldownWrap,
      list,
      status,
    ]),
  )

  let cooldownUntil = 0
  const buttons = new Map<string, HTMLButtonElement>()

  function setStatus(msg: string, kind: 'info' | 'ok' | 'err' = 'info') {
    status.textContent = msg
    status.dataset.kind = kind
  }

  champSelect.addEventListener('change', () => store.setChampion(champSelect.value))

  function startCooldown(ms: number) {
    cooldownUntil = Date.now() + ms
    // snap the bar to full with no transition, then drain it over the cooldown
    cooldownBar.style.transition = 'none'
    cooldownBar.style.width = '100%'
    // force reflow so the next style change animates
    void cooldownBar.offsetWidth
    cooldownBar.style.transition = `width ${ms}ms linear`
    cooldownBar.style.width = '0%'
    renderList()
    window.setTimeout(() => {
      setStatus('다시 공격할 수 있습니다 ⚔')
      renderList()
    }, ms)
  }

  async function attack(target: string) {
    const now = Date.now()
    if (now < cooldownUntil) return
    const champion = store.getChampion()
    if (!champion) return
    if (champion === target) {
      setStatus('자기 군대는 공격할 수 없습니다.', 'err')
      return
    }
    cooldownUntil = now + COOLDOWN_MS
    renderList()

    const res = await backend.attack(target, champion, null)
    if (res.ok) {
      // optimistic: drop the rival's total and play our own charge animation
      store.applyVote(
        { slug: target, total: res.total, amount: ATTACK_DAMAGE, kind: 'attack' },
        true,
      )
      store.emitAssault({ champion, target, amount: ATTACK_DAMAGE })
      const name = store.get(target)?.name ?? target
      setStatus(`${name} 진영을 강타! (−${ATTACK_DAMAGE}표)`, 'ok')
      startCooldown(COOLDOWN_MS)
    } else {
      cooldownUntil = res.retryAfter ? now + res.retryAfter * 1000 : now
      setStatus(
        res.retryAfter
          ? `너무 빠릅니다 — ${res.retryAfter}초 후 다시.`
          : `공격 실패: ${res.error}`,
        'err',
      )
      if (res.retryAfter) startCooldown(res.retryAfter * 1000)
      else renderList()
    }
  }

  const renderChampion = () => {
    const ranked = store.ranked()
    const champ = store.getChampion()
    champSelect.replaceChildren(
      ...ranked.map((l) =>
        el('option', { value: l.slug, text: l.name, selected: l.slug === champ }),
      ),
    )
    if (champ) champSelect.value = champ
  }

  const renderList = rafThrottle(() => {
    const champ = store.getChampion()
    const onCooldown = Date.now() < cooldownUntil
    const rivals = store.ranked().slice(0, RIVALS_SHOWN)
    list.replaceChildren(
      ...rivals.map((lang) => {
        const isChamp = lang.slug === champ
        const swatch = el('span', { class: 'combat-swatch' })
        swatch.style.background = lang.color
        let action: HTMLElement
        if (isChamp) {
          action = el('span', { class: 'combat-mine', text: '내 군대' })
        } else {
          const btn = el('button', {
            class: 'combat-attack',
            type: 'button',
            onClick: () => attack(lang.slug),
          }, [el('span', { text: '⚔ 공격' })]) as HTMLButtonElement
          if (onCooldown) btn.setAttribute('disabled', '')
          buttons.set(lang.slug, btn)
          action = btn
        }
        return el('li', { class: isChamp ? 'combat-row is-mine' : 'combat-row' }, [
          swatch,
          el('span', { class: 'combat-name', text: lang.name }),
          el('span', { class: 'combat-votes', text: lang.votes.toLocaleString() }),
          action,
        ])
      }),
    )
  })

  store.onChange(() => {
    renderChampion()
    renderList()
  })
  store.onChampionChange(() => {
    renderChampion()
    renderList()
  })
  renderChampion()
  renderList()
}
