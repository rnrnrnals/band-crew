-- Optional demo team for BAND-DEMO join code (run once in SQL Editor)
insert into public.teams (name, genre, bio, cover_url, invite_code, invite_code_created_at)
values (
  '퇴근 후 기타',
  '인디 / 록',
  '직장인 밴드. 수요일 밤 합주, 가끔 홍대 버스킹.',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=500&fit=crop',
  'BAND-DEMO',
  now()
)
on conflict (invite_code) do nothing;
