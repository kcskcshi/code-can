import './style.css'
import type { Backend } from './types'
import { Store } from './store'
import { BattleField } from './battle'
import { IS_LIVE } from './config'
import { DemoBackend } from './backend/demo'
import { SupabaseBackend } from './backend/supabase'
import { mountLeaderboard } from './ui/leaderboard'
import { mountVotePanel } from './ui/votePanel'
import { mountCombatHud } from './ui/combatPanel'
import { mountChatPanel } from './ui/chatPanel'
import { openStatsModal } from './ui/statsModal'
import { openHallOfFameModal } from './ui/hallOfFameModal'
import { shareCard } from './ui/share'
import { showToast } from './ui/toast'
import { stats } from './stats'
import { el } from './ui/dom'

async function boot() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const store = new Store()

  // --- layout ---------------------------------------------------------------
  const modeBadge = el('span', { class: 'mode-badge', text: '...' })
  const presenceBadge = el('span', { class: 'presence-badge', text: '🟢 …' })
  const winnerChip = el('button', { class: 'chip', type: 'button', text: '👑 어제 우승: …' })
  const statsChip = el('button', { class: 'chip', type: 'button', text: '🏅 내 기록' })
  const shareChip = el('button', { class: 'chip', type: 'button', text: '📸 공유' })
  const canvas = el('canvas', { class: 'battle-canvas' })
  const battleWrap = el('section', { class: 'battlefield' }, [canvas])
  const hud = el('section', { class: 'hud-bar' })
  const colVote = el('div', { class: 'col col-vote' })
  const colStand = el('div', { class: 'col col-stand' })
  const colChat = el('div', { class: 'col col-chat' })

  app.append(
    el('header', { class: 'site-header' }, [
      el('div', { class: 'brand' }, [
        el('h1', { class: 'logo', text: 'LUNCH WARS' }),
        modeBadge,
        presenceBadge,
      ]),
      el('p', {
        class: 'tagline',
        text: '오늘 점심 뭐 먹지? 메뉴에 투표해 행성을 키우고, 라이벌 행성을 꾹 눌러 부숴라 🍱⚔',
      }),
      el('div', { class: 'chip-row' }, [winnerChip, statsChip, shareChip]),
    ]),
    battleWrap,
    hud,
    el('main', { class: 'grid' }, [colVote, colStand, colChat]),
    el('footer', { class: 'site-footer' }, [
      el('p', {
        text: '스페인 길거리에서 여행자들이 "가장 위대한 점심 메뉴"를 묻는 깡통 투표로 여비를 벌던 일화에서 출발했습니다.',
      }),
    ]),
  )

  // --- backend (live Supabase, or in-memory demo) ---------------------------
  let backend: Backend
  try {
    backend = IS_LIVE ? new SupabaseBackend() : new DemoBackend()
    await backend.rollRound() // archive yesterday's winner + reset if a new day
    const langs = await backend.load()
    store.init(langs)
  } catch (err) {
    console.warn('[code-can] live backend unavailable, falling back to demo:', err)
    backend = new DemoBackend()
    await backend.rollRound()
    store.init(await backend.load())
  }

  modeBadge.textContent = backend.mode === 'live' ? '● LIVE' : '● DEMO'
  modeBadge.dataset.mode = backend.mode
  modeBadge.title =
    backend.mode === 'live'
      ? 'Supabase 실시간 연결됨'
      : 'Supabase 미설정 — 로컬 시뮬레이션 모드 (README 참고)'

  // live player count in the header
  backend.subscribePresence((n) => {
    presenceBadge.textContent = `🟢 ${n}명 전쟁 중`
  })

  // --- retention: stats, hall of fame, share --------------------------------
  stats.markVisit()
  stats.onUnlock((a) => showToast(`업적 해금! ${a.emoji} ${a.name}`))
  statsChip.addEventListener('click', openStatsModal)
  shareChip.addEventListener('click', () => void shareCard(store))

  void backend.loadWinners().then((winners) => {
    const top = winners[0]
    winnerChip.textContent = top ? `👑 어제 우승: ${top.name}` : '👑 명예의 전당'
    winnerChip.addEventListener('click', () => openHallOfFameModal(winners))
  })

  // stream remote votes/attacks into the store
  backend.subscribe((e) => store.applyVote(e, false))
  // seed this round's persisted chat before subscribing, then stream live chat
  // + assault animations from the arena channel
  for (const m of await backend.loadChat()) store.addChat(m)
  backend.subscribeArena({
    onChat: (m) => store.addChat(m),
    onAssault: (a) => store.emitAssault(a),
  })

  // --- mount UI -------------------------------------------------------------
  const combat = mountCombatHud(hud, store, backend)
  mountVotePanel(colVote, store, backend)
  mountLeaderboard(colStand, store)
  mountChatPanel(colChat, store, backend)

  const battle = new BattleField(canvas, store)
  // hold your own planet → vote (+), hold a rival → attack (−); combo ramps both
  battle.onAttackTarget((slug, amount) => combat.onAttack(slug, amount))
  battle.onVoteTarget((slug, amount) => combat.onVote(slug, amount))
  battle.start()
}

boot()
