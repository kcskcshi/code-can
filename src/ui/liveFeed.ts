import type { Store } from '../store'
import { el, rafThrottle } from './dom'

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
        return el('li', { class: it.self ? 'feed-item is-self' : 'feed-item' }, [
          dot,
          el('span', { class: 'feed-name', text: it.name }),
          el('span', { class: 'feed-msg', text: it.self ? '내 한 표 ⚔' : '득표' }),
          el('span', { class: 'feed-total', text: it.total.toLocaleString() }),
        ])
      }),
    )
  })

  store.onChange(render)
  render()
}
