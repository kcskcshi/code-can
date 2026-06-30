import type { Store } from '../store'
import { el, rafThrottle } from './dom'
import { fmtVotes } from './format'

const SHOWN = 16

/** Animated, ranked bar list of the contenders. */
export function mountLeaderboard(root: HTMLElement, store: Store): void {
  const list = el('ol', { class: 'lb-list' })
  root.append(
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '⚔ 전황 (Standings)' }),
      list,
    ]),
  )

  // Reuse row nodes by slug so CSS width transitions animate smoothly.
  const rows = new Map<string, { row: HTMLElement; bar: HTMLElement; votes: HTMLElement; rank: HTMLElement }>()

  const render = rafThrottle(() => {
    const ranked = store.ranked()
    const leader = ranked[0]?.votes || 1
    const top = ranked.slice(0, SHOWN)

    top.forEach((lang, i) => {
      let entry = rows.get(lang.slug)
      if (!entry) {
        const rank = el('span', { class: 'lb-rank' })
        const swatch = el('span', { class: 'lb-swatch' })
        swatch.style.background = lang.color
        const name = el('span', { class: 'lb-name', text: lang.name })
        const votes = el('span', { class: 'lb-votes' })
        const bar = el('span', { class: 'lb-bar-fill' })
        bar.style.background = lang.color
        const barWrap = el('span', { class: 'lb-bar' }, [bar])
        const row = el('li', { class: 'lb-row' }, [
          rank,
          swatch,
          el('span', { class: 'lb-meta' }, [name, votes]),
          barWrap,
        ])
        entry = { row, bar, votes, rank }
        rows.set(lang.slug, entry)
      }
      entry.rank.textContent = String(i + 1)
      entry.row.classList.toggle('is-leader', i === 0)
      entry.votes.textContent = fmtVotes(lang.votes)
      entry.bar.style.width = `${Math.max(4, (lang.votes / leader) * 100)}%`
      // ensure DOM order matches rank
      if (list.children[i] !== entry.row) list.insertBefore(entry.row, list.children[i] ?? null)
    })
  })

  store.onChange(render)
  render()
}
