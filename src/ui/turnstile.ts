import { TURNSTILE_SITE_KEY } from '../config'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
      size?: 'normal' | 'flexible' | 'compact'
    },
  ) => string
  reset: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/**
 * Manages a single Cloudflare Turnstile widget. When no site key is set the
 * manager is inert and `token()` returns null — voting still works (the Edge
 * Function decides whether to require a token).
 */
export class Turnstile {
  private current: string | null = null
  private widgetId: string | null = null
  readonly enabled = Boolean(TURNSTILE_SITE_KEY)

  mount(container: HTMLElement) {
    if (!this.enabled) return
    const script = document.createElement('script')
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => this.render(container)
    document.head.append(script)
  }

  private render(container: HTMLElement) {
    if (!window.turnstile) return
    this.widgetId = window.turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'dark',
      size: 'flexible',
      callback: (t) => (this.current = t),
      'expired-callback': () => (this.current = null),
      'error-callback': () => (this.current = null),
    })
  }

  token(): string | null {
    return this.current
  }

  /** Tokens are single-use; refresh after each spend. */
  consume() {
    this.current = null
    if (this.enabled && this.widgetId && window.turnstile) {
      window.turnstile.reset(this.widgetId)
    }
  }
}
