import type { Store } from '../store'
import { el, rafThrottle } from './dom'
import { fmtVotes } from './format'

/** Scrolling list of the most recent votes. */
export function mountLiveFeed(root: HTMLElement, store: Store): void {
  const list = el('ul', { class: 'feed-list' })
  root.append(
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '📡 실시간 (Live feed)' }),
      list,
    ]),
  )

  const render = rafThrottle(() => {
    const items = store.recentFeed()
    list.replaceChildren(
      ...items.map((it) => {
        const dot = el('span', { class: 'feed-dot' })
        dot.style.background = it.color
        const attack = it.kind === 'attack'
        const cls =
          'feed-item' + (it.self ? ' is-self' : '') + (attack ? ' is-attack' : '')
        const msg = attack ? '공격받음 💥' : it.self ? '내 한 표 🍽' : '득표'
        return el('li', { class: cls }, [
          dot,
          el('span', { class: 'feed-name', text: it.name }),
          el('span', { class: 'feed-msg', text: msg }),
          el('span', { class: 'feed-total', text: fmtVotes(it.total) }),
        ])
      }),
    )
  })

  store.onChange(render)
  render()
}
