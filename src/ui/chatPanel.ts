import type { Backend } from '../types'
import type { Store } from '../store'
import { el, rafThrottle } from './dom'

const NICK_KEY = 'cc_nick'
const MAX_LEN = 200

const ADJECTIVES = [
  'Brave', 'Pixel', 'Retro', 'Turbo', 'Cyber', 'Mega', 'Hyper', 'Glitch',
  'Neon', 'Crimson', 'Golden', 'Shadow', 'Iron', 'Swift', 'Cosmic', 'Quantum',
]
const NOUNS = [
  'Knight', 'Wizard', 'Ranger', 'Goblin', 'Dragon', 'Samurai', 'Ninja',
  'Paladin', 'Hacker', 'Bard', 'Golem', 'Phoenix', 'Raider', 'Coder',
]

/** Get (or mint and remember) this browser's random pixel nickname. */
function getNick(): string {
  let nick = ''
  try {
    nick = localStorage.getItem(NICK_KEY) ?? ''
  } catch {
    /* private mode — fall through to an in-memory nick */
  }
  if (!nick) {
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    nick = `${a}_${n}_${Math.floor(Math.random() * 90 + 10)}`
    try {
      localStorage.setItem(NICK_KEY, nick)
    } catch {
      /* ignore */
    }
  }
  return nick
}

/** Ephemeral live chat. Messages broadcast to connected clients only — nothing
 * is stored, and a refresh clears the log. */
export function mountChatPanel(root: HTMLElement, store: Store, backend: Backend): void {
  const nick = getNick()
  const list = el('ul', { class: 'chat-list' })
  const input = el('input', {
    class: 'chat-input',
    type: 'text',
    maxlength: MAX_LEN,
    placeholder: '메시지 입력 후 Enter…',
    'aria-label': '채팅 메시지',
  }) as HTMLInputElement
  const sendBtn = el('button', { class: 'chat-send', type: 'button', text: '전송' })

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '💬 채팅 (Live chat)' }),
      el('p', { class: 'chat-nick', text: `당신: ${nick}` }),
      list,
      el('div', { class: 'chat-compose' }, [input, sendBtn]),
    ]),
  )

  function send() {
    const text = input.value.trim()
    if (!text) return
    const msg = { nick, text: text.slice(0, MAX_LEN), ts: Date.now() }
    store.addChat(msg) // optimistic local echo
    backend.sendChat(msg) // broadcast to other clients (no-op in demo)
    input.value = ''
    input.focus()
  }

  sendBtn.addEventListener('click', send)
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault()
      send()
    }
  })

  const render = rafThrottle(() => {
    const msgs = store.recentChat()
    list.replaceChildren(
      ...msgs.map((m) =>
        el('li', { class: m.nick === nick ? 'chat-item is-me' : 'chat-item' }, [
          el('span', { class: 'chat-from', text: m.nick }),
          el('span', { class: 'chat-text', text: m.text }),
        ]),
      ),
    )
    list.scrollTop = list.scrollHeight
  })

  store.onChatChange(render)
  render()
}
