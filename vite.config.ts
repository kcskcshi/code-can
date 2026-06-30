import { defineConfig } from 'vite'

// GitHub Project Pages serve at https://<user>.github.io/code-can/ so the app
// must be built with a matching base path. Hosts that serve from the domain
// root (Vercel, Netlify, custom domains) need base '/'. Vercel sets VERCEL=1
// automatically during builds, so we default to root there. An explicit
// VITE_BASE always wins if set.
const base =
  process.env.VITE_BASE ?? (process.env.VERCEL ? '/' : '/code-can/')

export default defineConfig({ base })
