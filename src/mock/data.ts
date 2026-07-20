import type {
  AppUser,
  BandTeam,
  ChatMessage,
  Post,
  PracticeSessionMeta,
  ScheduleEvent,
  Story,
  TeamAudioTrack,
} from '../types';

export const CURRENT_USER: AppUser = {
  id: 'u1',
  name: '김민수',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop',
};

export const TEAMS: BandTeam[] = [
  {
    id: 't-demo',
    name: '퇴근 후 기타',
    genre: '인디 / 록',
    bio: '직장인 밴드. 수요일 밤 합주, 가끔 홍대 버스킹.',
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=500&fit=crop',
    members: [
      {
        id: 'm1',
        nick: '민수',
        position: 'elec',
        isLeader: true,
        avatar: CURRENT_USER.avatar,
      },
      {
        id: 'm2',
        nick: '지현',
        position: 'vocal',
        bio: '발라드·인디 보컬. 화음 맞추는 거 좋아해요.',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop',
      },
      {
        id: 'm3',
        nick: '태호',
        position: 'bass',
        bio: '슬랩 베이스 연습 중. 수요일 저녁 가능.',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop',
      },
      {
        id: 'm4',
        nick: '수아',
        position: 'drums',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop',
      },
    ],
  },
  {
    id: 't-night',
    name: '야근밴드',
    genre: '펑크 / 얼터',
    bio: '야근 대신 리허설. 볼륨은 크게, 회의는 짧게.',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&h=500&fit=crop',
    members: [
      {
        id: 'n1',
        nick: '제이',
        position: 'vocal',
        isLeader: true,
        bio: '펑크·얼터 보컬. 합동 공연 제안 환영!',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop',
      },
      {
        id: 'n2',
        nick: '린',
        position: 'elec',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop',
      },
      {
        id: 'n3',
        nick: '코코',
        position: 'keys',
        avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&h=120&fit=crop',
      },
    ],
  },
  {
    id: 't-garage',
    name: '주차금지',
    genre: '개러지록',
    bio: '지하연습실  Occupants. 신곡 작업 중.',
    cover: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&h=500&fit=crop',
    members: [
      {
        id: 'g1',
        nick: '현우',
        position: 'bass',
        isLeader: true,
        bio: '개러지록 베이스. 신곡 작업할 때 연락 주세요.',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop',
      },
      {
        id: 'g2',
        nick: '별',
        position: 'drums',
        avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=120&h=120&fit=crop',
      },
      {
        id: 'g3',
        nick: '온유',
        position: 'acoustic',
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop',
      },
      {
        id: 'g4',
        nick: '새롬',
        position: 'sax',
        avatar: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=120&h=120&fit=crop',
      },
    ],
  },
  {
    id: 't-soft',
    name: '소프트클로즈',
    genre: '발라드 / 어쿠스틱',
    bio: '작은 소리로 크게 울리는 팀.',
    cover: 'https://images.unsplash.com/photo-1514320291840-75f0a710c6ba?w=800&h=500&fit=crop',
    members: [
      {
        id: 's1',
        nick: '하늘',
        position: 'vocal',
        isLeader: true,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop',
      },
      {
        id: 's2',
        nick: '다온',
        position: 'acoustic',
        avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=120&fit=crop',
      },
      {
        id: 's3',
        nick: '이안',
        position: 'keys',
        avatar: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=120&h=120&fit=crop',
      },
    ],
  },
];

/** teamId → 이 팀을 팔로우하는 팀 id 목록 */
export const INITIAL_TEAM_FOLLOWERS: Record<string, string[]> = {
  't-demo': ['t-night', 't-soft'],
  't-night': ['t-demo', 't-garage', 't-soft'],
  't-garage': ['t-night'],
  't-soft': ['t-demo', 't-night', 't-garage'],
};

/** teamId → 이 팀이 팔로우하는 팀 id 목록 (다른 팀 프로필용) */
export const INITIAL_TEAM_FOLLOWING: Record<string, string[]> = {
  't-demo': ['t-night', 't-garage', 't-soft'],
  't-night': ['t-demo', 't-garage'],
  't-garage': ['t-night', 't-soft'],
  't-soft': ['t-demo'],
};

export const INITIAL_STORIES: Story[] = [
  {
    id: 'st1',
    teamId: 't-night',
    image: 'https://images.unsplash.com/photo-1501612780327-45045538702b?w=600&h=900&fit=crop',
    caption: '오늘 리허설 끝!',
    createdAt: '2026-07-18T10:00:00',
  },
  {
    id: 'st1b',
    teamId: 't-night',
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=900&fit=crop',
    caption: '신곡 후렴 녹음',
    createdAt: '2026-07-18T10:30:00',
  },
  {
    id: 'st1c',
    teamId: 't-night',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=900&fit=crop',
    caption: '다음 주 공연 준비',
    createdAt: '2026-07-18T11:00:00',
  },
  {
    id: 'st2',
    teamId: 't-garage',
    image: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=600&h=900&fit=crop',
    caption: '신곡 훅 나왔다',
    createdAt: '2026-07-18T09:00:00',
  },
  {
    id: 'st2b',
    teamId: 't-garage',
    image: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=600&h=900&fit=crop',
    caption: '연습실 셋업',
    createdAt: '2026-07-18T09:30:00',
  },
  {
    id: 'st3',
    teamId: 't-soft',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=900&fit=crop',
    caption: '버스킹 준비중',
    createdAt: '2026-07-17T20:00:00',
  },
  {
    id: 'st4',
    teamId: 't-demo',
    image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&h=900&fit=crop',
    caption: '우리 연습실 오픈',
    createdAt: '2026-07-17T18:00:00',
  },
  {
    id: 'st4b',
    teamId: 't-demo',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&h=900&fit=crop',
    caption: '첫 레이어드 합주 성공',
    createdAt: '2026-07-17T19:00:00',
  },
];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'p1',
    teamId: 't-night',
    mediaType: 'video',
    mediaUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    caption: '야근 대신 합주. 후렴 파트 영상 올려봐요.',
    likes: 42,
    comments: [
      { id: 'c1', author: '주차금지', text: '기타 톤 미쳤다' },
      { id: 'c2', author: '소프트클로즈', text: '다음에 합동 공연 하자!' },
    ],
    createdAt: '2026-07-18T08:00:00',
  },
  {
    id: 'p2',
    teamId: 't-garage',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800&h=1000&fit=crop',
    caption: '연습실 벽지에 스티커 붙이기 대회 중.',
    likes: 28,
    comments: [
      {
        id: 'c3',
        author: '퇴근 후 기타',
        authorTeam: '퇴근 후 기타',
        authorNick: '민수',
        authorUserId: 'u1',
        text: '분위기 좋다',
      },
    ],
    createdAt: '2026-07-17T21:00:00',
  },
  {
    id: 'p3',
    teamId: 't-soft',
    mediaType: 'video',
    mediaUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    caption: '어쿠스틱 버전 스케치. 소리 켜고 들어보세요.',
    likes: 67,
    comments: [],
    createdAt: '2026-07-17T15:00:00',
  },
  {
    id: 'p4',
    teamId: 't-demo',
    mediaType: 'text',
    caption: '수요일 연습 9시 → 9시 반으로 옮깁니다. 늦지 마세요!',
    likes: 11,
    comments: [{ id: 'c4', author: '지현', text: '확인!' }],
    createdAt: '2026-07-16T12:00:00',
  },
  {
    id: 'p5',
    teamId: 't-garage',
    mediaType: 'video',
    mediaUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    caption: '드럼 필인만 따로. 레이어드 합주 연습실에서 맞춰봐요.',
    likes: 35,
    comments: [],
    createdAt: '2026-07-16T09:00:00',
  },
];

export const INITIAL_TEAM_AUDIO: TeamAudioTrack[] = [
  {
    id: 'au1',
    teamId: 't-demo',
    title: '신곡 INTRO 데모',
    audioUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    durationSec: 2,
    caption: '기타·드럼 레이어 테스트. 후렴만 따로 녹음.',
    body: '이번 주말 연습 때 후렴 구간만 같이 맞춰봐요. 템포는 BPM 128 기준입니다.',
    coverImage: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900&h=900&fit=crop',
    likes: 8,
    likedByMe: false,
    comments: [
      {
        id: 'ac-au1-1',
        author: '민수',
        text: '0:01 후렴 구간 체크!',
        likes: 0,
        likedByMe: false,
      },
    ],
    createdAt: '2026-07-18T14:00:00',
  },
  {
    id: 'au2',
    teamId: 't-demo',
    title: '수요일 합주 리허설',
    audioUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/gong-2.mp3',
    durationSec: 4,
    caption: '전주 + 후렴 템포 맞춤용.',
    likes: 3,
    comments: [],
    createdAt: '2026-07-15T20:30:00',
  },
  {
    id: 'au3',
    teamId: 't-night',
    title: '펑크 루프 A',
    audioUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/gong-2.mp3',
    durationSec: 4,
    caption: '합주 전에 템포 맞출 때 써요.',
    likes: 5,
    comments: [],
    createdAt: '2026-07-17T11:00:00',
  },
];

export const INITIAL_EVENTS: ScheduleEvent[] = [
  {
    id: 'e1',
    teamId: 't-demo',
    title: '정기 합주',
    place: '합정 연습실 B',
    date: '2026-07-22T21:00:00',
    kind: 'practice',
  },
  {
    id: 'e2',
    teamId: 't-demo',
    title: '홍대 버스킹',
    place: '홍대입구 걷고싶은거리',
    date: '2026-07-26T18:00:00',
    kind: 'gig',
  },
  {
    id: 'e3',
    teamId: 't-demo',
    title: '신곡 녹음 데이',
    place: '온라인 연습실',
    date: '2026-07-29T20:00:00',
    kind: 'practice',
  },
];

export const INITIAL_SESSIONS: PracticeSessionMeta[] = [
  {
    id: 'ps1',
    teamId: 't-demo',
    title: '첫 번째 싱글 — Verse',
    bpm: 92,
    updatedAt: '2026-07-17T20:00:00',
  },
  {
    id: 'ps2',
    teamId: 't-demo',
    title: '버스킹 셋리스트 #1',
    bpm: 110,
    updatedAt: '2026-07-15T19:00:00',
  },
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'ch1',
    teamId: 't-demo',
    authorNick: '지현',
    authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop',
    text: '수요일 연습 9시 반 맞죠?',
    createdAt: '2026-07-19T09:12:00',
  },
  {
    id: 'ch2',
    teamId: 't-demo',
    authorNick: '민수',
    authorAvatar: CURRENT_USER.avatar,
    text: '네! 합정 연습실 B로 갈게요.',
    createdAt: '2026-07-19T09:18:00',
  },
  {
    id: 'ch3',
    teamId: 't-demo',
    authorNick: '태호',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop',
    text: '베이스 앰프 챙겨갑니다 🎸',
    createdAt: '2026-07-19T09:25:00',
  },
  {
    id: 'ch4',
    teamId: 't-demo',
    authorNick: '수아',
    authorAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop',
    text: '드럼 스틱 새로 샀어요 ㅎㅎ',
    createdAt: '2026-07-19T10:02:00',
  },
  {
    id: 'ch5',
    teamId: 't-night',
    chatThreadId: 't-demo__t-night',
    authorNick: '제이',
    authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop',
    text: '다음 주 합동 연습 어때요?',
    createdAt: '2026-07-18T20:30:00',
  },
  {
    id: 'ch6',
    teamId: 't-demo',
    chatThreadId: 't-demo__t-night',
    authorNick: '민수',
    authorAvatar: CURRENT_USER.avatar,
    text: '좋아요! 수요일 저녁 가능해요.',
    createdAt: '2026-07-18T21:05:00',
  },
];

export const DEMO_JOIN_CODE = 'BAND-DEMO';
