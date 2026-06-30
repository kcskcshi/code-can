import type { Language } from './types'

/**
 * Curated catalog of lunch-menu contenders. Single source of truth for the
 * frontend (demo mode + planet colors/emoji). The DB seed in
 * supabase/migrations/0005_food_theme.sql mirrors this list — keep them in sync.
 *
 * The export names stay `LANGUAGES`/`LANGUAGE_BY_SLUG` for historical reasons;
 * they now hold menu items. `votes` here only seeds DEMO mode (in tenths).
 */
export const LANGUAGES: Omit<Language, 'votes'>[] = [
  { slug: 'kimchi-stew', name: '김치찌개', tag: '김치', color: '#e2503f', emoji: '🍲' },
  { slug: 'jjajang', name: '짜장면', tag: '짜장', color: '#3b2a22', emoji: '🍜' },
  { slug: 'sushi', name: '초밥', tag: '초밥', color: '#f7a6b4', emoji: '🍣' },
  { slug: 'pizza', name: '피자', tag: '피자', color: '#e8893b', emoji: '🍕' },
  { slug: 'burger', name: '햄버거', tag: '버거', color: '#a9682f', emoji: '🍔' },
  { slug: 'bibimbap', name: '비빔밥', tag: '비빔', color: '#d8482e', emoji: '🍚' },
  { slug: 'ramen', name: '라면', tag: '라면', color: '#d23b2c', emoji: '🍜' },
  { slug: 'tteokbokki', name: '떡볶이', tag: '떡볶', color: '#e84a4a', emoji: '🌶' },
  { slug: 'pasta', name: '파스타', tag: '파스타', color: '#e0b14a', emoji: '🍝' },
  { slug: 'pho', name: '쌀국수', tag: '쌀국', color: '#cb9a5c', emoji: '🍲' },
  { slug: 'katsu', name: '돈까스', tag: '돈까', color: '#c98a4a', emoji: '🍖' },
  { slug: 'chicken', name: '치킨', tag: '치킨', color: '#d98b2b', emoji: '🍗' },
  { slug: 'curry', name: '카레', tag: '카레', color: '#d99a1f', emoji: '🍛' },
  { slug: 'taco', name: '타코', tag: '타코', color: '#e0a83c', emoji: '🌮' },
  { slug: 'dumpling', name: '만두', tag: '만두', color: '#e8d8a8', emoji: '🥟' },
  { slug: 'udon', name: '우동', tag: '우동', color: '#cdb98a', emoji: '🍜' },
  { slug: 'malatang', name: '마라탕', tag: '마라', color: '#b8323c', emoji: '🥘' },
  { slug: 'burrito', name: '부리토', tag: '부리', color: '#b9893f', emoji: '🌯' },
  { slug: 'sandwich', name: '샌드위치', tag: '샌드', color: '#d8b86a', emoji: '🥪' },
  { slug: 'naengmyeon', name: '냉면', tag: '냉면', color: '#5c8aa8', emoji: '🍜' },
  { slug: 'gyudon', name: '규동', tag: '규동', color: '#b0743a', emoji: '🍱' },
  { slug: 'padthai', name: '팟타이', tag: '팟타', color: '#dd8f4a', emoji: '🍤' },
  { slug: 'fries', name: '감자튀김', tag: '감튀', color: '#e8c44a', emoji: '🍟' },
  { slug: 'salad', name: '샐러드', tag: '샐러', color: '#6db84a', emoji: '🥗' },
  { slug: 'gimbap', name: '김밥', tag: '김밥', color: '#3f8f5c', emoji: '🍙' },
  { slug: 'steak', name: '스테이크', tag: '스테', color: '#8a3f33', emoji: '🥩' },
  { slug: 'sundubu', name: '순두부', tag: '순두', color: '#e26a4a', emoji: '🍲' },
  { slug: 'jeyuk', name: '제육덮밥', tag: '제육', color: '#cf4633', emoji: '🍚' },
]

export const LANGUAGE_BY_SLUG: Record<string, Omit<Language, 'votes'>> =
  Object.fromEntries(LANGUAGES.map((l) => [l.slug, l]))
