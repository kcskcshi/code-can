import { defineConfig } from 'vite'

// GitHub Project Pages serve at https://<user>.github.io/code-can/
// so the app must be built with a matching base path. For a custom domain
// (or user/organization page) set VITE_BASE=/ in the build environment.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/code-can/',
})
