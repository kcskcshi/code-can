import type { Winner } from '../types'
import { LANGUAGE_BY_SLUG } from '../languages'
import { el } from './dom'
import { fmtVotes } from './format'
import { openModal } from './modal'

/** "명예의 전당" modal: recent daily-round winners, newest first. */
export function openHallOfFameModal(winners: Winner[]) {
  const body = winners.length
    ? el(
        'ol',
        { class: 'hof-list' },
        winners.map((w, i) => {
          const emoji = LANGUAGE_BY_SLUG[w.slug]?.emoji ?? '🍽'
          return el('li', { class: i === 0 ? 'hof-row is-latest' : 'hof-row' }, [
            el('span', { class: 'hof-date', text: w.round_date }),
            el('span', { class: 'hof-emoji', text: emoji }),
            el('span', { class: 'hof-name', text: w.name }),
            el('span', { class: 'hof-votes', text: `${fmtVotes(w.votes)}표` }),
          ])
        }),
      )
    : el('p', { class: 'hof-empty', text: '아직 우승 기록이 없어요. 내일 0시에 첫 우승이 박제됩니다!' })

  openModal('👑 명예의 전당', el('div', {}, [
    el('p', { class: 'modal-subtitle', text: '매일 KST 0시, 1위 메뉴가 박제됩니다.' }),
    body,
  ]))
}
