import type { Language } from './types'

/**
 * Curated catalog of contenders. This is the single source of truth for the
 * frontend (demo mode + sprite colors). The DB seed in
 * supabase/migrations/0001_init.sql mirrors this list — keep them in sync.
 *
 * `votes` here are only used as the starting point for DEMO mode.
 */
export const LANGUAGES: Omit<Language, 'votes'>[] = [
  { slug: 'javascript', name: 'JavaScript', tag: 'JS', color: '#f7df1e' },
  { slug: 'typescript', name: 'TypeScript', tag: 'TS', color: '#3178c6' },
  { slug: 'python', name: 'Python', tag: 'PY', color: '#4b8bbe' },
  { slug: 'rust', name: 'Rust', tag: 'RS', color: '#ce422b' },
  { slug: 'go', name: 'Go', tag: 'GO', color: '#00add8' },
  { slug: 'java', name: 'Java', tag: 'JAV', color: '#e76f00' },
  { slug: 'c', name: 'C', tag: 'C', color: '#5c6bc0' },
  { slug: 'cpp', name: 'C++', tag: 'C++', color: '#00599c' },
  { slug: 'csharp', name: 'C#', tag: 'C#', color: '#9b4f96' },
  { slug: 'ruby', name: 'Ruby', tag: 'RB', color: '#cc342d' },
  { slug: 'php', name: 'PHP', tag: 'PHP', color: '#777bb4' },
  { slug: 'swift', name: 'Swift', tag: 'SW', color: '#fa7343' },
  { slug: 'kotlin', name: 'Kotlin', tag: 'KT', color: '#7f52ff' },
  { slug: 'dart', name: 'Dart', tag: 'DRT', color: '#0175c2' },
  { slug: 'scala', name: 'Scala', tag: 'SC', color: '#dc322f' },
  { slug: 'haskell', name: 'Haskell', tag: 'HS', color: '#5e5086' },
  { slug: 'elixir', name: 'Elixir', tag: 'EX', color: '#6e4a7e' },
  { slug: 'clojure', name: 'Clojure', tag: 'CLJ', color: '#5881d8' },
  { slug: 'lua', name: 'Lua', tag: 'LUA', color: '#000080' },
  { slug: 'perl', name: 'Perl', tag: 'PL', color: '#39457e' },
  { slug: 'r', name: 'R', tag: 'R', color: '#276dc3' },
  { slug: 'julia', name: 'Julia', tag: 'JL', color: '#9558b2' },
  { slug: 'zig', name: 'Zig', tag: 'ZIG', color: '#f7a41d' },
  { slug: 'elm', name: 'Elm', tag: 'ELM', color: '#60b5cc' },
  { slug: 'ocaml', name: 'OCaml', tag: 'ML', color: '#ec670f' },
  { slug: 'erlang', name: 'Erlang', tag: 'ERL', color: '#a90533' },
  { slug: 'fsharp', name: 'F#', tag: 'F#', color: '#378bba' },
  { slug: 'bash', name: 'Bash', tag: 'SH', color: '#89e051' },
  { slug: 'sql', name: 'SQL', tag: 'SQL', color: '#e38c00' },
  { slug: 'cobol', name: 'COBOL', tag: 'CBL', color: '#1f6f8b' },
]

export const LANGUAGE_BY_SLUG: Record<string, Omit<Language, 'votes'>> =
  Object.fromEntries(LANGUAGES.map((l) => [l.slug, l]))
