import { stats } from '../stats'
import { el } from './dom'
import { fmtVotes } from './format'
import { openModal } from './modal'

/** "내 기록" modal: play stats + achievement badges (locked/unlocked). */
export function openStatsModal() {
  const s = stats.snapshot()
  const rows: [string, string][] = [
    ['키운 표(누적)', `+${fmtVotes(s.voteTenths)}`],
    ['깎은 표(누적)', `−${fmtVotes(s.attackTenths)}`],
    ['최고 콤보', `x${s.bestCombo}`],
    ['투표한 메뉴', `${s.menusVoted.length}종`],
    ['방문 일수', `${s.visitDays}일`],
    ['공유 횟수', `${s.sharedCount}회`],
  ]

  const statList = el(
    'ul',
    { class: 'stats-list' },
    rows.map(([k, v]) =>
      el('li', { class: 'stats-row' }, [
        el('span', { class: 'stats-k', text: k }),
        el('span', { class: 'stats-v', text: v }),
      ]),
    ),
  )

  const badges = el(
    'div',
    { class: 'badge-grid' },
    stats.achievements().map((a) => {
      const on = stats.isUnlocked(a.id)
      return el('div', { class: on ? 'badge is-on' : 'badge' }, [
        el('span', { class: 'badge-emoji', text: on ? a.emoji : '🔒' }),
        el('span', { class: 'badge-name', text: a.name }),
        el('span', { class: 'badge-desc', text: a.desc }),
      ])
    }),
  )

  openModal('🏅 내 기록', el('div', {}, [
    statList,
    el('h4', { class: 'modal-subtitle', text: '업적' }),
    badges,
  ]))
}
