-- ============================================================================
-- LUNCH WARS — add ~20 Korean office-worker lunch staples.
-- Paste into the Supabase SQL Editor and Run. No data is wiped (new rows only).
-- total_votes is in tenths (a vote is +10 = 1.0).
-- ============================================================================

insert into public.languages (slug, name, tag, color, total_votes) values
  ('gukbap','국밥','국밥','#c2703a',300),
  ('budae','부대찌개','부대','#d6473a',420),
  ('jeyuk-bokkeum','제육볶음','제볶','#d84a2e',460),
  ('kimchi-fried-rice','김치볶음밥','김볶','#e25b3f',380),
  ('doenjang','된장찌개','된장','#b08a3f',350),
  ('kalguksu','칼국수','칼국','#d8c79a',280),
  ('sundae-gukbap','순대국','순대','#8a5a4a',260),
  ('yukgaejang','육개장','육개','#c0392b',330),
  ('galbitang','갈비탕','갈비','#c9a06a',310),
  ('jjamppong','짬뽕','짬뽕','#d63a2c',440),
  ('tangsuyuk','탕수육','탕수','#d98a3a',390),
  ('bibim-guksu','비빔국수','비국','#e0492e',240),
  ('jjukkumi','쭈꾸미','쭈꾸','#d23a4a',300),
  ('nakji','낙지볶음','낙지','#b8323c',250),
  ('omurice','오므라이스','오므','#e0a83c',360),
  ('dolsot','돌솥비빔밥','돌솥','#c75a33',340),
  ('ppyeo-haejang','뼈해장국','뼈해','#b0432e',270),
  ('kongnamul-gukbap','콩나물국밥','콩국','#cdb86a',230),
  ('samgyeopsal','삼겹살','삼겹','#e08a7a',500),
  ('baekban','백반','백반','#cdb89a',290)
on conflict (slug) do nothing;
