import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CURRENT_USER,
  DEMO_JOIN_CODE,
  INITIAL_CHAT_MESSAGES,
  INITIAL_EVENTS,
  INITIAL_POSTS,
  INITIAL_SESSIONS,
  INITIAL_TEAM_PRACTICE_SONGS,
  INITIAL_STORIES,
  INITIAL_TEAM_AUDIO,
  INITIAL_TEAM_FOLLOWERS,
  INITIAL_TEAM_FOLLOWING,
  TEAMS,
} from '../mock/data';
import type {
  AppUser,
  BandTeam,
  ChatMessage,
  HighlightItem,
  PositionId,
  Post,
  PracticeSessionMeta,
  TeamMember,
  TeamPracticeSong,
  ScheduleEvent,
  SendChatPayload,
  Story,
  TeamAudioTrack,
  TeamHighlight,
  PostComment,
} from '../types';
import { filterActiveStories } from '../utils/storyUtils';
import { createRandomInviteCode, isInviteCodeActive } from '../utils/inviteUtils';
import { getCrossTeamThreadId } from '../utils/chatUtils';
import { deleteSessionTracks } from '../utils/practiceStorage';
import {
  loadTeamPracticeSongsCache,
  mergeTeamPracticeSongs,
  saveTeamPracticeSongsCache,
} from '../utils/teamPracticeSongsCache';
import { normalizeTeamBio } from '../utils/teamBio';
import { normalizeInstagramUsername } from '../utils/teamInstagram';
import { isSupabaseConfigured } from '../lib/supabase';
import { findCurrentMember, isCurrentMember, isTeamLeader, canManageTeam as memberCanManageTeam, mergeDisplayProfile } from '../mock/memberUtils';
import { bootstrapUserData, type BootstrapData } from '../services/bootstrapService';
import {
  createAudioCommentInDb,
  createAudioTrackInDb,
  deleteAudioCommentInDb,
  deleteAudioTrackInDb,
  toggleAudioCommentLikeInDb,
  toggleAudioLikeInDb,
  updateAudioCommentInDb,
} from '../services/audioService';
import {
  appendHighlightStoriesInDb,
  createHighlightInDb,
  deleteHighlightInDb,
  updateHighlightInDb,
} from '../services/highlightsService';
import { createChatMessageInDb, subscribeChatMessages } from '../services/chatService';
import { createPracticeSessionInDb, deletePracticeSessionInDb, updatePracticeSessionInDb } from '../services/practiceService';
import {
  createTeamPracticeSongInDb,
  deleteTeamPracticeSongInDb,
  fetchTeamPracticeSongsForTeamIds,
  isMissingTeamPracticeSongsTable,
  promoteTeamPracticeSongInDb,
} from '../services/teamPracticeSongService';
import { createScheduleEventInDb, deleteScheduleEventInDb } from '../services/scheduleService';
import { createStoryInDb } from '../services/storiesService';
import {
  fetchFollowsForTeam,
  toggleFollowInDb,
} from '../services/followsService';
import {
  createPostCommentInDb,
  createPostInDb,
  deletePostCommentInDb,
  deletePostInDb,
  togglePostCommentLikeInDb,
  togglePostLikeInDb,
  updatePostCommentInDb,
} from '../services/postsService';
import {
  cleanupEmptyTeamsInDb,
  createTeamInDb,
  normalizeTeamName,
  fetchMyTeams,
  fetchTeamById,
  generateInviteCodeInDb,
  joinTeamInDb,
  leaveTeamInDb,
  searchTeamsByName,
  setActiveTeamInDb,
  setTeamCoLeaderInDb,
  syncMemberProfileInDb,
  transferTeamLeadershipInDb,
  updateMemberPositionInDb,
  updateTeamProfileInDb,
} from '../services/teamsService';
import { useAuth } from './AuthContext';

const LS_KEY = 'band-crew-state-v1';

interface Persisted {
  activeTeamId: string | null;
  myTeamIds: string[];
  followingIds: string[];
  followerIdsByTeam: Record<string, string[]>;
  customTeams: BandTeam[];
  userProfile?: AppUser;
  posts: Post[];
  events: ScheduleEvent[];
  sessions: PracticeSessionMeta[];
  teamPracticeSongs: TeamPracticeSong[];
  stories: Story[];
  highlights: TeamHighlight[];
  teamAudios: TeamAudioTrack[];
  chatMessages: ChatMessage[];
}

interface AppState {
  user: AppUser;
  teams: BandTeam[];
  activeTeamId: string | null;
  myTeamIds: string[];
  followingIds: string[];
  posts: Post[];
  events: ScheduleEvent[];
  sessions: PracticeSessionMeta[];
  teamPracticeSongs: TeamPracticeSong[];
  stories: Story[];
  highlights: TeamHighlight[];
  teamAudios: TeamAudioTrack[];
  chatMessages: ChatMessage[];
  activeTeam: BandTeam | null;
  dataLoading: boolean;
  dataReady: boolean;
  isActiveTeamLeader: boolean;
  canManageActiveTeam: boolean;
  canManageTeam: (teamId: string) => boolean;
  transferTeamLeadership: (memberId: string) => Promise<{ ok: boolean; message: string }>;
  setTeamCoLeader: (memberId: string | null) => Promise<{ ok: boolean; message: string }>;
  refreshAppData: () => Promise<void>;
  loadTeam: (teamId: string) => Promise<BandTeam | undefined>;
  createTeam: (
    name: string,
    genre: string,
    nick: string,
    position: PositionId,
  ) => Promise<{ ok: boolean; message: string }>;
  joinTeam: (
    code: string,
    nick: string,
    position: PositionId,
  ) => Promise<{ ok: boolean; message: string }>;
  leaveTeam: (teamId: string) => Promise<{ ok: boolean; message: string }>;
  setActiveTeam: (id: string) => void;
  toggleFollow: (teamId: string) => void;
  addPost: (post: Omit<Post, 'id' | 'likes' | 'comments' | 'createdAt' | 'likedByMe'>) => void;
  deletePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string, parentId?: string) => void;
  addAudioComment: (trackId: string, text: string, parentId?: string) => void;
  updateAudioComment: (trackId: string, commentId: string, text: string) => void;
  deleteAudioComment: (trackId: string, commentId: string) => void;
  toggleAudioCommentLike: (trackId: string, commentId: string) => void;
  toggleAudioLike: (trackId: string) => void;
  updateComment: (postId: string, commentId: string, text: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  toggleCommentLike: (postId: string, commentId: string) => void;
  addEvent: (ev: Omit<ScheduleEvent, 'id'>) => void;
  deleteEvent: (eventId: string) => Promise<boolean>;
  addSession: (title: string, bpm: number, teamId?: string) => PracticeSessionMeta;
  addTeamPracticeSong: (title: string, teamId: string) => Promise<{ ok: boolean; message?: string }>;
  updatePracticeSession: (sessionId: string, patch: { title?: string; bpm?: number }) => Promise<void>;
  promoteTeamPracticeSong: (songId: string) => Promise<void>;
  loadTeamPracticeSongs: (teamId: string) => Promise<void>;
  isOwnPracticeSession: (session: PracticeSessionMeta) => boolean;
  isOwnTeamPracticeSong: (song: TeamPracticeSong) => boolean;
  deleteSession: (sessionId: string) => Promise<boolean>;
  deleteTeamPracticeSong: (songId: string) => Promise<boolean>;
  sendChatMessage: (payload: SendChatPayload, options?: { peerTeamId?: string }) => void;
  addStory: (input: Omit<Story, 'id' | 'createdAt'>) => void;
  createHighlight: (teamId: string, title: string, storyIds: string[]) => void;
  updateHighlight: (highlightId: string, patch: { title?: string; storyIds?: string[] }) => void;
  appendStoriesToHighlight: (highlightId: string, storyIds: string[]) => void;
  deleteHighlight: (highlightId: string) => void;
  updateTeamProfile: (
    teamId: string,
    patch: { cover?: string; bio?: string; genre?: string; instagram?: string },
  ) => Promise<void>;
  updateUserProfile: (patch: {
    name?: string;
    avatar?: string;
    bio?: string;
    instagram?: string;
  }) => Promise<void>;
  updateMyPosition: (position: PositionId) => void;
  generateTeamInviteCode: (teamId: string) => void;
  addTeamAudio: (input: Omit<TeamAudioTrack, 'id' | 'createdAt' | 'comments' | 'likes' | 'likedByMe'>) => void;
  deleteTeamAudio: (trackId: string) => void;
  getTeam: (id: string) => BandTeam | undefined;
  getTeamFollowers: (teamId: string) => BandTeam[];
  getTeamFollowing: (teamId: string) => BandTeam[];
  searchTeams: (query: string) => Promise<BandTeam[]>;
}

const AppContext = createContext<AppState | null>(null);

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Persisted;
  } catch {
    return {};
  }
}

function resolveUserProfile(initial: Partial<Persisted>): AppUser {
  const base = initial.userProfile ?? CURRENT_USER;
  const activeId = initial.activeTeamId ?? null;
  const myIds = initial.myTeamIds ?? [];
  if (!activeId || !myIds.includes(activeId)) return base;

  const team = [...TEAMS, ...(initial.customTeams ?? [])].find((t) => t.id === activeId);
  const member = team ? findCurrentMember(team, base) : undefined;

  if (member && member.nick !== base.name) {
    return { ...base, name: member.nick };
  }
  return base;
}

function savePersisted(p: Persisted) {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
}

function normalizeComment(comment: PostComment): PostComment {
  return {
    ...comment,
    likes: comment.likes ?? 0,
    likedByMe: comment.likedByMe ?? false,
  };
}

function normalizeTeamAudios(tracks: TeamAudioTrack[]): TeamAudioTrack[] {
  return tracks.map((track) => ({
    ...track,
    likes: track.likes ?? 0,
    likedByMe: track.likedByMe ?? false,
    comments: (track.comments ?? []).map(normalizeComment),
  }));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { profile: authProfile, updateRemoteProfile, authRequired, session, authLoading } = useAuth();
  const useDb = isSupabaseConfigured && authRequired;
  const userId = session?.user.id;

  const initial = useDb ? ({} as Partial<Persisted>) : loadPersisted();
  const initialUser = resolveUserProfile(initial);
  const [customTeams, setCustomTeams] = useState<BandTeam[]>(() =>
    (initial.customTeams ?? []).filter((team) => team.members.length > 0),
  );
  const [userProfile, setUserProfile] = useState<AppUser>(initialUser);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(
    initial.activeTeamId ?? (useDb ? null : 't-demo'),
  );
  const [myTeamIds, setMyTeamIds] = useState<string[]>(
    initial.myTeamIds?.length ? initial.myTeamIds : useDb ? [] : ['t-demo'],
  );
  const [followingIds, setFollowingIds] = useState<string[]>(
    initial.followingIds ?? (useDb ? [] : ['t-night', 't-garage', 't-soft']),
  );
  const [followerIdsByTeam, setFollowerIdsByTeam] = useState<Record<string, string[]>>(
    initial.followerIdsByTeam ?? (useDb ? {} : INITIAL_TEAM_FOLLOWERS),
  );
  const [posts, setPosts] = useState<Post[]>(() =>
    useDb
      ? []
      : (initial.posts ?? INITIAL_POSTS).map((post) => ({
          ...post,
          comments: (post.comments ?? []).map((comment) => normalizeComment(comment)),
        })),
  );
  const [events, setEvents] = useState<ScheduleEvent[]>(
    initial.events ?? (useDb ? [] : INITIAL_EVENTS),
  );
  const [sessions, setSessions] = useState<PracticeSessionMeta[]>(
    initial.sessions ?? (useDb ? [] : INITIAL_SESSIONS),
  );
  const [teamPracticeSongs, setTeamPracticeSongs] = useState<TeamPracticeSong[]>(() => {
    if (initial.teamPracticeSongs?.length) return initial.teamPracticeSongs;
    if (useDb) {
      return mergeTeamPracticeSongs([], loadTeamPracticeSongsCache());
    }
    return INITIAL_TEAM_PRACTICE_SONGS;
  });
  const ownSessionIdsRef = useRef<Set<string>>(new Set());
  const [stories, setStories] = useState<Story[]>(() =>
    useDb ? [] : filterActiveStories(initial.stories ?? INITIAL_STORIES),
  );
  const [storyClock, setStoryClock] = useState(() => Date.now());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    initial.chatMessages ?? (useDb ? [] : INITIAL_CHAT_MESSAGES),
  );
  const [highlights, setHighlights] = useState<TeamHighlight[]>(initial.highlights ?? []);
  const [teamAudios, setTeamAudios] = useState<TeamAudioTrack[]>(
    useDb ? [] : normalizeTeamAudios(initial.teamAudios ?? INITIAL_TEAM_AUDIO),
  );
  const [dataReady, setDataReady] = useState(!useDb);
  const [dataLoading, setDataLoading] = useState(false);

  const activeStories = useMemo(
    () => filterActiveStories(stories, storyClock),
    [stories, storyClock],
  );

  useEffect(() => {
    if (!authRequired || !authProfile || !userId) return;
    setUserProfile((prev) => {
      const activeTeam = customTeams.find((team) => team.id === activeTeamId);
      const member = activeTeam ? findCurrentMember(activeTeam, prev) : undefined;
      const next = mergeDisplayProfile(userId, authProfile, member, prev);
      if (
        prev.id === next.id &&
        prev.name === next.name &&
        prev.avatar === next.avatar &&
        prev.bio === next.bio &&
        prev.instagram === next.instagram
      ) {
        return prev;
      }
      return next;
    });
  }, [authProfile, authRequired, userId, customTeams, activeTeamId]);

  const applyBootstrapData = useCallback((data: BootstrapData) => {
    setCustomTeams(data.teams);
    setMyTeamIds(data.myTeamIds);
    setActiveTeamId(data.activeTeamId);
    setFollowingIds(data.followingIds);
    setFollowerIdsByTeam(data.followerIdsByTeam);
    setPosts(data.posts.map((post) => ({ ...post, comments: post.comments.map(normalizeComment) })));
    setTeamAudios(normalizeTeamAudios(data.teamAudios));
    setStories(data.stories);
    setHighlights(data.highlights);
    setEvents(data.events);
    if (userId) {
      ownSessionIdsRef.current = new Set(
        data.sessions.filter((s) => s.authorUserId === userId).map((s) => s.id),
      );
    }
    setSessions(data.sessions);
    setTeamPracticeSongs((prev) => {
      const merged = mergeTeamPracticeSongs(
        data.teamPracticeSongs,
        prev,
        loadTeamPracticeSongsCache(),
      );
      if (useDb) saveTeamPracticeSongsCache(merged);
      return merged;
    });
    setChatMessages(data.chatMessages);
    setDataReady(true);
  }, [userId, useDb]);

  const refreshAppData = useCallback(async () => {
    if (!useDb || !userId) return;
    setDataLoading(true);
    try {
      const data = await bootstrapUserData(userId);
      applyBootstrapData(data);
    } catch (err) {
      console.error('[BandCrew] refresh failed', err);
    } finally {
      setDataLoading(false);
    }
  }, [applyBootstrapData, useDb, userId]);

  useEffect(() => {
    if (!useDb) {
      setDataReady(true);
      return;
    }
    if (authLoading) return;
    if (!userId) {
      setDataReady(true);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataReady(false);

    cleanupEmptyTeamsInDb()
      .then(() => bootstrapUserData(userId))
      .then((data) => {
        if (cancelled) return;
        applyBootstrapData(data);
      })
      .catch(async (err) => {
        console.error('[BandCrew] bootstrap failed', err);
        if (cancelled) return;
        try {
          const minimal = await fetchMyTeams(userId);
          setCustomTeams(minimal.teams);
          setMyTeamIds(minimal.myTeamIds);
          setActiveTeamId(minimal.activeTeamId);
        } catch (minimalErr) {
          console.error('[BandCrew] minimal team load failed', minimalErr);
        }
        setDataReady(true);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyBootstrapData, useDb, userId, authLoading]);

  useEffect(() => {
    if (!useDb || !dataReady || !userId) return;

    const chatTeamIds = [
      ...new Set([...myTeamIds, ...followingIds, ...(activeTeamId ? [activeTeamId] : [])]),
    ];
    if (chatTeamIds.length === 0) return;

    const appendChatMessage = (message: ChatMessage) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message].sort(
          (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
        );
      });
    };

    return subscribeChatMessages(chatTeamIds, appendChatMessage);
  }, [useDb, dataReady, userId, myTeamIds, followingIds, activeTeamId]);

  useEffect(() => {
    if (!useDb || !userId || !activeTeamId) return;
    void fetchFollowsForTeam(activeTeamId)
      .then(setFollowingIds)
      .catch((err) => console.warn('[BandCrew] follow load failed', err));
  }, [useDb, userId, activeTeamId]);

  useEffect(() => {
    const id = window.setInterval(() => setStoryClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const savedName = (initial.userProfile ?? CURRENT_USER).name;
    if (initialUser.name !== savedName) {
      savePersisted({
        activeTeamId: initial.activeTeamId ?? null,
        myTeamIds: initial.myTeamIds ?? [],
        followingIds: initial.followingIds ?? ['t-night', 't-garage', 't-soft'],
        followerIdsByTeam: initial.followerIdsByTeam ?? INITIAL_TEAM_FOLLOWERS,
        customTeams: initial.customTeams ?? [],
        userProfile: initialUser,
        posts: initial.posts ?? INITIAL_POSTS,
        events: initial.events ?? INITIAL_EVENTS,
        sessions: initial.sessions ?? INITIAL_SESSIONS,
        teamPracticeSongs: initial.teamPracticeSongs ?? INITIAL_TEAM_PRACTICE_SONGS,
        stories: filterActiveStories(initial.stories ?? INITIAL_STORIES),
        highlights: initial.highlights ?? [],
        teamAudios: normalizeTeamAudios(initial.teamAudios ?? INITIAL_TEAM_AUDIO),
        chatMessages: initial.chatMessages ?? INITIAL_CHAT_MESSAGES,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time migration for mismatched nick/profile
  }, []);

  const teams = useMemo(() => {
    const map = new Map<string, BandTeam>();
    if (useDb) {
      customTeams.forEach((t) => map.set(t.id, t));
    } else {
      [...TEAMS, ...customTeams].forEach((t) => map.set(t.id, t));
    }
    return Array.from(map.values());
  }, [customTeams, useDb]);

  const canManageTeam = useCallback(
    (teamId: string) => {
      if (!myTeamIds.includes(teamId)) return false;
      const team = teams.find((t) => t.id === teamId);
      if (!team) return false;
      return memberCanManageTeam(team, userProfile);
    },
    [myTeamIds, teams, userProfile],
  );

  const isActiveTeamLeader = useMemo(() => {
    if (!activeTeamId) return false;
    const team = teams.find((t) => t.id === activeTeamId);
    if (!team) return false;
    return isTeamLeader(team, userProfile);
  }, [activeTeamId, teams, userProfile]);

  const canManageActiveTeam = useMemo(
    () => (activeTeamId ? canManageTeam(activeTeamId) : false),
    [activeTeamId, canManageTeam],
  );

  const persist = useCallback(
    (patch: Partial<Persisted>) => {
      if (useDb) return;

      const next: Persisted = {
        activeTeamId,
        myTeamIds,
        followingIds,
        followerIdsByTeam,
        customTeams,
        userProfile,
        posts,
        events,
        sessions,
        teamPracticeSongs,
        stories,
        highlights,
        teamAudios,
        chatMessages,
        ...patch,
      };
      savePersisted(next);
    },
    [activeTeamId, myTeamIds, followingIds, followerIdsByTeam, customTeams, userProfile, posts, events, sessions, teamPracticeSongs, stories, highlights, teamAudios, chatMessages, useDb],
  );

  useEffect(() => {
    if (activeStories.length === stories.length) return;
    setStories(activeStories);
    if (!useDb) persist({ stories: activeStories });
  }, [activeStories, stories.length, persist, useDb]);

  useEffect(() => {
    const persisted = initial.stories ?? INITIAL_STORIES;
    const filtered = filterActiveStories(persisted);
    if (persisted.length !== filtered.length) {
      persist({ stories: filtered });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time cleanup for expired stories in storage
  }, []);

  const user = userProfile;

  const getMyNick = () => {
    if (!activeTeam) return userProfile.name;
    return findCurrentMember(activeTeam, userProfile)?.nick ?? userProfile.name;
  };

  const mergeTeam = (team: BandTeam) => {
    setCustomTeams((prev) => [...prev.filter((t) => t.id !== team.id), team]);
  };

  const loadTeam = useCallback(
    async (teamId: string): Promise<BandTeam | undefined> => {
      const cached = teams.find((t) => t.id === teamId);
      if (cached) return cached;
      if (!useDb) return undefined;
      try {
        const team = await fetchTeamById(teamId);
        if (team) mergeTeam(team);
        return team ?? undefined;
      } catch (err) {
        console.warn('[BandCrew] loadTeam failed', err);
        return undefined;
      }
    },
    [teams, useDb],
  );

  const searchTeams = useCallback(
    async (query: string): Promise<BandTeam[]> => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      if (useDb) {
        try {
          const found = await searchTeamsByName(trimmed);
          found.forEach((team) => mergeTeam(team));
          return found;
        } catch (err) {
          console.warn('[BandCrew] searchTeams failed', err);
          return [];
        }
      }

      const needle = trimmed.toLowerCase();
      return teams.filter((team) => team.name.toLowerCase().includes(needle)).slice(0, 12);
    },
    [teams, useDb],
  );

  const cloneTeamForEdit = (teamId: string, source: BandTeam[]): BandTeam[] => {
    const existing = source.find((t) => t.id === teamId);
    if (existing) return source;
    if (useDb) return source;
    const base = TEAMS.find((t) => t.id === teamId);
    if (!base) return source;
    return [...source.filter((t) => t.id !== teamId), { ...base }];
  };

  const syncCurrentMember = (
    teamsList: BandTeam[],
    teamId: string | null,
    nextName: string,
    nextAvatar: string,
    nextBio?: string,
    nextInstagram?: string,
  ) => {
    if (!teamId) return teamsList;
    return teamsList.map((team) => {
      if (team.id !== teamId) return team;
      return {
        ...team,
        members: team.members.map((member) => {
          if (!isCurrentMember(member, userProfile)) return member;
          return {
            ...member,
            userId: member.userId ?? userProfile.id,
            nick: nextName,
            avatar: nextAvatar,
            bio: nextBio !== undefined ? nextBio : member.bio,
            instagram:
              nextInstagram !== undefined ? nextInstagram || undefined : member.instagram,
          };
        }),
      };
    });
  };

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  const createTeam = async (
    name: string,
    genre: string,
    nick: string,
    position: PositionId,
  ): Promise<{ ok: boolean; message: string }> => {
    if (useDb && !userId) {
      return { ok: false, message: '로그인 세션이 만료됐어요. 다시 로그인해 주세요.' };
    }

    if (useDb && userId) {
      try {
        const team = await createTeamInDb(userId, userProfile, name, genre, nick, position);
        mergeTeam(team);
        const trimmedNick = nick.trim();
        const nextUser = { ...userProfile, name: trimmedNick };
        setUserProfile(nextUser);
        setMyTeamIds((prev) => (prev.includes(team.id) ? prev : [...prev, team.id]));
        setActiveTeamId(team.id);
        return { ok: true, message: `${team.name} 팀을 만들었어요!` };
      } catch (err) {
        console.error('[BandCrew] createTeam failed', err);
        return {
          ok: false,
          message: err instanceof Error ? err.message : '팀 만들기에 실패했어요.',
        };
      }
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, message: '팀 이름을 입력해주세요.' };
    }
    const normalized = normalizeTeamName(trimmedName);
    const nameTaken = [...TEAMS, ...customTeams].some(
      (team) => normalizeTeamName(team.name) === normalized,
    );
    if (nameTaken) {
      return { ok: false, message: '이미 사용 중인 팀 이름이에요.' };
    }

    const id = `t-${Date.now()}`;
    const trimmedNick = nick.trim();
    const member: TeamMember = {
      id: userProfile.id,
      nick: trimmedNick,
      position,
      isLeader: true,
      avatar: userProfile.avatar,
      bio: userProfile.bio,
    };
    const team: BandTeam = {
      id,
      name: trimmedName,
      genre: genre.trim() || '장르 미정',
      bio: '새로 만든 밴드팀입니다.',
      cover: '',
      members: [member],
    };
    const nextUser = { ...userProfile, name: trimmedNick };
    const nextCustom = [...customTeams, team];
    const nextMine = [...myTeamIds, id];
    setUserProfile(nextUser);
    setCustomTeams(nextCustom);
    setMyTeamIds(nextMine);
    setActiveTeamId(id);
    persist({
      userProfile: nextUser,
      customTeams: nextCustom,
      myTeamIds: nextMine,
      activeTeamId: id,
    });
    return { ok: true, message: `${trimmedName} 팀을 만들었어요!` };
  };

  const joinTeam = async (
    code: string,
    nick: string,
    position: PositionId,
  ): Promise<{ ok: boolean; message: string }> => {
    if (useDb && userId) {
      try {
        const res = await joinTeamInDb(userId, userProfile, code, nick, position);
        if (res.ok && res.team) {
          mergeTeam(res.team);
          const trimmedNick = nick.trim();
          setUserProfile({ ...userProfile, name: trimmedNick });
          setMyTeamIds((prev) => (prev.includes(res.team!.id) ? prev : [...prev, res.team!.id]));
          setActiveTeamId(res.team.id);
        }
        return res;
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : '가입 실패' };
      }
    }

    const normalized = code.trim().toUpperCase();
    let team: BandTeam | undefined;

    if (normalized === DEMO_JOIN_CODE) {
      team = teams.find((t) => t.id === 't-demo');
    } else {
      const matched = teams.find((t) => t.inviteCode?.toUpperCase() === normalized);
      if (matched) {
        if (!isInviteCodeActive(matched)) {
          return { ok: false, message: '만료된 초대 코드예요. 팀에서 새 코드를 받아 주세요.' };
        }
        team = matched;
      }
    }

    if (!team) {
      return { ok: false, message: '초대 코드를 찾을 수 없어요. BAND-DEMO 를 시도해보세요.' };
    }

    const trimmedNick = nick.trim();
    const member: TeamMember = {
      id: userProfile.id,
      nick: trimmedNick,
      position,
      avatar: userProfile.avatar,
      bio: userProfile.bio,
    };
    let nextCustom = customTeams;
    if (TEAMS.some((t) => t.id === team.id)) {
      // clone base team into custom with new member for demo mutability
      const cloned: BandTeam = {
        ...team,
        members: [...team.members, member],
      };
      nextCustom = [...customTeams.filter((t) => t.id !== team.id), cloned];
      setCustomTeams(nextCustom);
    } else {
      nextCustom = customTeams.map((t) =>
        t.id === team.id ? { ...t, members: [...t.members, member] } : t,
      );
      setCustomTeams(nextCustom);
    }

    const nextUser = { ...userProfile, name: trimmedNick };
    const nextMine = myTeamIds.includes(team.id) ? myTeamIds : [...myTeamIds, team.id];
    setUserProfile(nextUser);
    setMyTeamIds(nextMine);
    setActiveTeamId(team.id);
    persist({
      userProfile: nextUser,
      customTeams: nextCustom,
      myTeamIds: nextMine,
      activeTeamId: team.id,
    });
    return { ok: true, message: `${team.name}에 가입했어요!` };
  };

  const purgeTeamFromState = useCallback(
    (teamId: string, nextActiveTeamId?: string | null) => {
      setMyTeamIds((prev) => prev.filter((id) => id !== teamId));
      setCustomTeams((prev) => prev.filter((t) => t.id !== teamId));
      setSessions((prev) => prev.filter((s) => s.teamId !== teamId));
      setPosts((prev) => prev.filter((p) => p.teamId !== teamId));
      setEvents((prev) => prev.filter((e) => e.teamId !== teamId));
      setStories((prev) => prev.filter((s) => s.teamId !== teamId));
      setHighlights((prev) => prev.filter((h) => h.teamId !== teamId));
      setTeamAudios((prev) => prev.filter((a) => a.teamId !== teamId));
      setChatMessages((prev) => prev.filter((m) => m.teamId !== teamId));
      setTeamPracticeSongs((prev) => prev.filter((s) => s.teamId !== teamId));
      setActiveTeamId((prev) => {
        if (prev !== teamId) return prev;
        if (nextActiveTeamId !== undefined) return nextActiveTeamId;
        return null;
      });
    },
    [],
  );

  const leaveTeam = async (teamId: string): Promise<{ ok: boolean; message: string }> => {
    if (!myTeamIds.includes(teamId)) {
      return { ok: false, message: '이 팀의 멤버가 아니에요.' };
    }

    const team = teams.find((t) => t.id === teamId);
    const me = team ? findCurrentMember(team, userProfile) : undefined;
    if (me?.isLeader && team && team.members.length > 1) {
      return { ok: false, message: '리더는 다른 멤버에게 리더를 넘긴 뒤 나갈 수 있어요.' };
    }

    if (useDb && userId) {
      try {
        const res = await leaveTeamInDb(userId, teamId);
        if (!res.ok) return res;

        purgeTeamFromState(teamId, res.nextActiveTeamId);
        return { ok: true, message: res.message };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : '팀 나가기에 실패했어요.',
        };
      }
    }

    const nextMine = myTeamIds.filter((id) => id !== teamId);
    const nextCustom = customTeams.filter((t) => t.id !== teamId);
    const nextActive = activeTeamId === teamId ? (nextMine[0] ?? null) : activeTeamId;
    purgeTeamFromState(teamId, nextActive);
    persist({
      myTeamIds: nextMine,
      customTeams: nextCustom,
      activeTeamId: nextActive,
      sessions: sessions.filter((s) => s.teamId !== teamId),
      posts: posts.filter((p) => p.teamId !== teamId),
      events: events.filter((e) => e.teamId !== teamId),
      stories: stories.filter((s) => s.teamId !== teamId),
      highlights: highlights.filter((h) => h.teamId !== teamId),
      teamAudios: teamAudios.filter((a) => a.teamId !== teamId),
      chatMessages: chatMessages.filter((m) => m.teamId !== teamId),
      teamPracticeSongs: teamPracticeSongs.filter((s) => s.teamId !== teamId),
    });
    return { ok: true, message: '팀에서 나갔어요.' };
  };

  const setActiveTeam = (id: string) => {
    setActiveTeamId(id);
    if (!useDb) persist({ activeTeamId: id });
    if (useDb && userId) {
      void setActiveTeamInDb(userId, id).catch((err) =>
        console.error('[BandCrew] setActiveTeam failed', err),
      );
    }
  };

  const toggleFollow = (teamId: string) => {
    const isFollowing = followingIds.includes(teamId);
    const nextFollowing = isFollowing
      ? followingIds.filter((id) => id !== teamId)
      : [...followingIds, teamId];
    setFollowingIds(nextFollowing);

    let nextFollowers = followerIdsByTeam;
    if (activeTeamId && activeTeamId !== teamId) {
      const current = followerIdsByTeam[teamId] ?? [];
      const updated = isFollowing
        ? current.filter((id) => id !== activeTeamId)
        : current.includes(activeTeamId)
          ? current
          : [...current, activeTeamId];
      nextFollowers = { ...followerIdsByTeam, [teamId]: updated };
      setFollowerIdsByTeam(nextFollowers);
    }

    if (!useDb) persist({ followingIds: nextFollowing, followerIdsByTeam: nextFollowers });

    if (useDb && activeTeamId && activeTeamId !== teamId) {
      void toggleFollowInDb(activeTeamId, teamId, !isFollowing)
        .then(async () => {
          const team = await fetchTeamById(teamId);
          if (team) mergeTeam(team);
        })
        .catch((err) => console.error('[BandCrew] toggleFollow failed', err));
    }
  };

  const addPost = (input: Omit<Post, 'id' | 'likes' | 'comments' | 'createdAt' | 'likedByMe'>) => {
    if (!canManageTeam(input.teamId)) return;
    if (useDb && userId) {
      void createPostInDb(userId, {
        teamId: input.teamId,
        mediaType: input.mediaType,
        mediaUrl: input.mediaUrl,
        caption: input.caption,
      })
        .then((post) => setPosts((prev) => [post, ...prev]))
        .catch((err) => console.error('[BandCrew] addPost failed', err));
      return;
    }

    const post: Post = {
      ...input,
      id: `p-${Date.now()}`,
      likes: 0,
      likedByMe: false,
      comments: [],
      createdAt: new Date().toISOString(),
    };
    const next = [post, ...posts];
    setPosts(next);
    persist({ posts: next });
  };

  const deletePost = (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post || !canManageTeam(post.teamId)) return;
    const next = posts.filter((p) => p.id !== postId);
    setPosts(next);
    if (!useDb) persist({ posts: next });
    if (useDb) {
      void deletePostInDb(postId).catch((err) => console.error('[BandCrew] deletePost failed', err));
    }
  };

  const toggleLike = (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    const liked = !target?.likedByMe;
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      const nextLiked = !p.likedByMe;
      return { ...p, likedByMe: nextLiked, likes: p.likes + (nextLiked ? 1 : -1) };
    });
    setPosts(next);
    if (!useDb) persist({ posts: next });
    if (useDb && userId && liked !== undefined) {
      void togglePostLikeInDb(postId, userId, !!liked).catch((err) =>
        console.error('[BandCrew] toggleLike failed', err),
      );
    }
  };

  const addComment = (postId: string, text: string, parentId?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const post = posts.find((p) => p.id === postId);
    const nick = getMyNick();
    const isOtherTeamPost = !!activeTeamId && post?.teamId !== activeTeamId;
    const parent = parentId ? post?.comments.find((c) => c.id === parentId) : undefined;

    if (useDb && userId) {
      void createPostCommentInDb(userId, {
        postId,
        text: trimmed,
        authorTeamId: isOtherTeamPost ? activeTeamId ?? undefined : undefined,
        parentId: parent?.id,
        replyTo: parent ? parent.authorNick ?? parent.authorTeam ?? parent.author : undefined,
      })
        .then((comment) => {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p)),
          );
        })
        .catch((err) => console.error('[BandCrew] addComment failed', err));
      return;
    }

    const comment = {
      id: `c-${Date.now()}`,
      author: isOtherTeamPost ? (activeTeam?.name ?? nick) : nick,
      authorUserId: userProfile.id,
      authorTeam: isOtherTeamPost ? activeTeam?.name : undefined,
      authorNick: isOtherTeamPost ? nick : undefined,
      text: trimmed,
      parentId: parent?.id,
      replyTo: parent ? parent.authorNick ?? parent.authorTeam ?? parent.author : undefined,
      likes: 0,
      likedByMe: false,
    };
    const next = posts.map((p) =>
      p.id === postId ? { ...p, comments: [...p.comments, comment] } : p,
    );
    setPosts(next);
    persist({ posts: next });
  };

  const updateComment = (postId: string, commentId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const nick = getMyNick();
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      return {
        ...p,
        comments: p.comments.map((comment) => {
          if (comment.id !== commentId) return comment;
          const own =
            comment.authorUserId === userProfile.id ||
            (comment.authorTeam
              ? comment.authorTeam === activeTeam?.name && comment.authorNick === nick
              : comment.author === nick);
          if (!own) return comment;
          return { ...comment, text: trimmed };
        }),
      };
    });
    setPosts(next);
    if (!useDb) persist({ posts: next });
    if (useDb) {
      void updatePostCommentInDb(commentId, trimmed).catch((err) =>
        console.error('[BandCrew] updateComment failed', err),
      );
    }
  };

  const deleteComment = (postId: string, commentId: string) => {
    const nick = getMyNick();
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      const target = p.comments.find((comment) => comment.id === commentId);
      if (!target) return p;
      const own =
        target.authorUserId === userProfile.id ||
        (target.authorTeam
          ? target.authorTeam === activeTeam?.name && target.authorNick === nick
          : target.author === nick);
      if (!own) return p;
      return {
        ...p,
        comments: p.comments.filter(
          (comment) => comment.id !== commentId && comment.parentId !== commentId,
        ),
      };
    });
    setPosts(next);
    if (!useDb) persist({ posts: next });
    if (useDb) {
      void deletePostCommentInDb(commentId).catch((err) =>
        console.error('[BandCrew] deleteComment failed', err),
      );
    }
  };

  const addAudioComment = (trackId: string, text: string, parentId?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const track = teamAudios.find((t) => t.id === trackId);
    const member = activeTeam ? findCurrentMember(activeTeam, userProfile) : undefined;
    const nick = member?.nick ?? userProfile.name;
    const isOtherTeamTrack = !!activeTeamId && track?.teamId !== activeTeamId;
    const parent = parentId ? track?.comments?.find((c) => c.id === parentId) : undefined;

    if (useDb && userId) {
      void createAudioCommentInDb(userId, {
        trackId,
        text: trimmed,
        authorTeamId: isOtherTeamTrack ? activeTeamId ?? undefined : undefined,
        parentId: parent?.id,
        replyTo: parent ? parent.authorNick ?? parent.authorTeam ?? parent.author : undefined,
      })
        .then((comment) => {
          setTeamAudios((prev) =>
            prev.map((t) =>
              t.id === trackId ? { ...t, comments: [...(t.comments ?? []), comment] } : t,
            ),
          );
        })
        .catch((err) => console.error('[BandCrew] addAudioComment failed', err));
      return;
    }

    const comment = {
      id: `ac-${Date.now()}`,
      author: isOtherTeamTrack ? (activeTeam?.name ?? nick) : nick,
      authorUserId: userProfile.id,
      authorTeam: isOtherTeamTrack ? activeTeam?.name : undefined,
      authorNick: isOtherTeamTrack ? nick : undefined,
      authorAvatar: member?.avatar ?? userProfile.avatar,
      text: trimmed,
      parentId: parent?.id,
      replyTo: parent ? parent.authorNick ?? parent.authorTeam ?? parent.author : undefined,
      likes: 0,
      likedByMe: false,
    };
    const next = teamAudios.map((t) =>
      t.id === trackId ? { ...t, comments: [...(t.comments ?? []), comment] } : t,
    );
    setTeamAudios(next);
    persist({ teamAudios: next });
  };

  const updateAudioComment = (trackId: string, commentId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const nick = getMyNick();
    const next = teamAudios.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        comments: (t.comments ?? []).map((comment) => {
          if (comment.id !== commentId) return comment;
          const own =
            comment.authorUserId === userProfile.id ||
            (comment.authorTeam
              ? comment.authorTeam === activeTeam?.name && comment.authorNick === nick
              : comment.author === nick);
          if (!own) return comment;
          return { ...comment, text: trimmed };
        }),
      };
    });
    setTeamAudios(next);
    if (!useDb) persist({ teamAudios: next });
    if (useDb) {
      void updateAudioCommentInDb(commentId, trimmed).catch((err) =>
        console.error('[BandCrew] updateAudioComment failed', err),
      );
    }
  };

  const deleteAudioComment = (trackId: string, commentId: string) => {
    const nick = getMyNick();
    const next = teamAudios.map((t) => {
      if (t.id !== trackId) return t;
      const target = (t.comments ?? []).find((comment) => comment.id === commentId);
      if (!target) return t;
      const own =
        target.authorUserId === userProfile.id ||
        (target.authorTeam
          ? target.authorTeam === activeTeam?.name && target.authorNick === nick
          : target.author === nick);
      if (!own) return t;
      return {
        ...t,
        comments: (t.comments ?? []).filter(
          (comment) => comment.id !== commentId && comment.parentId !== commentId,
        ),
      };
    });
    setTeamAudios(next);
    if (!useDb) persist({ teamAudios: next });
    if (useDb) {
      void deleteAudioCommentInDb(commentId).catch((err) =>
        console.error('[BandCrew] deleteAudioComment failed', err),
      );
    }
  };

  const toggleAudioCommentLike = (trackId: string, commentId: string) => {
    let liked = false;
    const next = teamAudios.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        comments: (t.comments ?? []).map((comment) => {
          if (comment.id !== commentId) return comment;
          liked = !comment.likedByMe;
          return {
            ...comment,
            likedByMe: liked,
            likes: Math.max(0, (comment.likes ?? 0) + (liked ? 1 : -1)),
          };
        }),
      };
    });
    setTeamAudios(next);
    if (!useDb) persist({ teamAudios: next });
    if (useDb && userId) {
      void toggleAudioCommentLikeInDb(commentId, userId, liked).catch((err) =>
        console.error('[BandCrew] toggleAudioCommentLike failed', err),
      );
    }
  };

  const toggleAudioLike = (trackId: string) => {
    const target = teamAudios.find((t) => t.id === trackId);
    const liked = !target?.likedByMe;
    const next = teamAudios.map((t) => {
      if (t.id !== trackId) return t;
      const nextLiked = !t.likedByMe;
      return { ...t, likedByMe: nextLiked, likes: t.likes + (nextLiked ? 1 : -1) };
    });
    setTeamAudios(next);
    if (!useDb) persist({ teamAudios: next });
    if (useDb && userId) {
      void toggleAudioLikeInDb(trackId, userId, !!liked).catch((err) =>
        console.error('[BandCrew] toggleAudioLike failed', err),
      );
    }
  };

  const toggleCommentLike = (postId: string, commentId: string) => {
    let liked = false;
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      return {
        ...p,
        comments: p.comments.map((comment) => {
          if (comment.id !== commentId) return comment;
          liked = !comment.likedByMe;
          return {
            ...comment,
            likedByMe: liked,
            likes: Math.max(0, (comment.likes ?? 0) + (liked ? 1 : -1)),
          };
        }),
      };
    });
    setPosts(next);
    if (!useDb) persist({ posts: next });
    if (useDb && userId) {
      void togglePostCommentLikeInDb(commentId, userId, liked).catch((err) =>
        console.error('[BandCrew] toggleCommentLike failed', err),
      );
    }
  };

  const addEvent = (ev: Omit<ScheduleEvent, 'id'>) => {
    if (!canManageTeam(ev.teamId)) return;
    if (useDb) {
      void createScheduleEventInDb(ev)
        .then((event) => setEvents((prev) => [...prev, event]))
        .catch((err) => console.error('[BandCrew] addEvent failed', err));
      return;
    }
    const next = [...events, { ...ev, id: `e-${Date.now()}` }];
    setEvents(next);
    persist({ events: next });
  };

  const deleteEvent = useCallback(
    (eventId: string): Promise<boolean> => {
      const target = events.find((event) => event.id === eventId);
      if (!target || !canManageTeam(target.teamId)) return Promise.resolve(false);
      if (!confirm(`"${target.title}" 일정을 삭제할까요?`)) {
        return Promise.resolve(false);
      }

      const removeLocal = () => {
        setEvents((prev) => {
          const next = prev.filter((event) => event.id !== eventId);
          if (!useDb) persist({ events: next });
          return next;
        });
      };

      if (useDb && userId) {
        return deleteScheduleEventInDb(eventId)
          .then(() => {
            removeLocal();
            return true;
          })
          .catch((err) => {
            console.error('[BandCrew] deleteEvent failed', err);
            return false;
          });
      }

      removeLocal();
      return Promise.resolve(true);
    },
    [events, canManageTeam, useDb, userId, persist],
  );

  const isOwnPracticeSession = useCallback(
    (session: PracticeSessionMeta) => {
      if (!useDb) return true;
      if (!userId) return false;
      if (session.authorUserId === userId) return true;
      return ownSessionIdsRef.current.has(session.id);
    },
    [useDb, userId],
  );

  const isOwnTeamPracticeSong = useCallback(
    (song: TeamPracticeSong) => {
      if (!useDb) return true;
      if (!userId) return false;
      if (song.authorUserId === userId) return true;
      return false;
    },
    [useDb, userId],
  );

  const addSession = (title: string, bpm: number, teamId?: string) => {
    const resolvedTeamId = teamId ?? activeTeamId ?? 't-demo';
    if (useDb && userId && myTeamIds.includes(resolvedTeamId)) {
      const sessionId = crypto.randomUUID();
      ownSessionIdsRef.current.add(sessionId);
      const optimistic: PracticeSessionMeta = {
        id: sessionId,
        teamId: resolvedTeamId,
        title,
        bpm,
        updatedAt: new Date().toISOString(),
        authorUserId: userId,
      };
      setSessions((prev) => [optimistic, ...prev]);
      void createPracticeSessionInDb(resolvedTeamId, title, bpm, sessionId, userId)
        .then((session) =>
          setSessions((prev) =>
            prev.map((existing) => (existing.id === sessionId ? session : existing)),
          ),
        )
        .catch((err) => {
          console.error('[BandCrew] addSession failed', err);
          ownSessionIdsRef.current.delete(sessionId);
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        });
      return optimistic;
    }
    const session: PracticeSessionMeta = {
      id: `ps-${Date.now()}`,
      teamId: resolvedTeamId,
      title,
      bpm,
      updatedAt: new Date().toISOString(),
      authorUserId: userId || userProfile.id,
    };
    ownSessionIdsRef.current.add(session.id);
    const next = [session, ...sessions];
    setSessions(next);
    persist({ sessions: next });
    return session;
  };

  const addTeamPracticeSong = async (
    title: string,
    teamId: string,
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!canManageTeam(teamId)) {
      return { ok: false, message: '팀 리더만 연습곡을 설정할 수 있어요.' };
    }
    const applyLocal = (updater: (prev: TeamPracticeSong[]) => TeamPracticeSong[]) => {
      setTeamPracticeSongs((prev) => {
        const next = updater(prev);
        if (useDb) saveTeamPracticeSongsCache(next);
        else persist({ teamPracticeSongs: next });
        return next;
      });
    };

    if (useDb && userId && myTeamIds.includes(teamId)) {
      const songId = crypto.randomUUID();
      const optimistic: TeamPracticeSong = {
        id: songId,
        teamId,
        title,
        updatedAt: new Date().toISOString(),
        authorUserId: userId,
        isCurrent: true,
      };
      applyLocal((prev) => [
        optimistic,
        ...prev.map((song) =>
          song.teamId === teamId ? { ...song, isCurrent: false } : song,
        ),
      ]);

      try {
        const song = await createTeamPracticeSongInDb(teamId, title, songId, userId);
        applyLocal((prev) => prev.map((existing) => (existing.id === songId ? song : existing)));
        return { ok: true };
      } catch (err) {
        console.error('[BandCrew] addTeamPracticeSong failed', err);
        if (isMissingTeamPracticeSongsTable(err)) {
          return {
            ok: true,
            message: '연습곡을 기기에 저장했어요. DB 마이그레이션 후 다른 기기와 동기화돼요.',
          };
        }
        applyLocal((prev) => prev.filter((song) => song.id !== songId));
        return {
          ok: false,
          message: err instanceof Error ? err.message : '연습곡을 저장하지 못했어요.',
        };
      }
    }

    const song: TeamPracticeSong = {
      id: `tps-${Date.now()}`,
      teamId,
      title,
      updatedAt: new Date().toISOString(),
      authorUserId: userId || userProfile.id,
      isCurrent: true,
    };
    applyLocal((prev) => [
      song,
      ...prev.map((existing) =>
        existing.teamId === teamId ? { ...existing, isCurrent: false } : existing,
      ),
    ]);
    return { ok: true };
  };

  const loadTeamPracticeSongs = useCallback(
    async (teamId: string) => {
      if (!useDb) return;
      try {
        const rows = await fetchTeamPracticeSongsForTeamIds([teamId]);
        setTeamPracticeSongs((prev) => {
          const otherTeams = prev.filter((song) => song.teamId !== teamId);
          const localForTeam = prev.filter((song) => song.teamId === teamId);
          const cachedForTeam = loadTeamPracticeSongsCache().filter((song) => song.teamId === teamId);
          const mergedForTeam = mergeTeamPracticeSongs(rows, localForTeam, cachedForTeam);
          const next = [...otherTeams, ...mergedForTeam];
          saveTeamPracticeSongsCache(next);
          return next;
        });
      } catch (err) {
        console.warn('[BandCrew] loadTeamPracticeSongs failed', err);
      }
    },
    [useDb],
  );

  const updatePracticeSession = useCallback(
    async (sessionId: string, patch: { title?: string; bpm?: number }) => {
      const target = sessions.find((session) => session.id === sessionId);
      if (!target || !myTeamIds.includes(target.teamId)) {
        throw new Error('수정 권한이 없어요.');
      }

      const title = patch.title?.trim() || target.title;
      const bpm = patch.bpm ?? target.bpm;
      const optimistic: PracticeSessionMeta = {
        ...target,
        title,
        bpm,
        updatedAt: new Date().toISOString(),
      };

      setSessions((prev) => prev.map((session) => (session.id === sessionId ? optimistic : session)));

      if (useDb) {
        const updated = await updatePracticeSessionInDb(sessionId, { title, bpm });
        setSessions((prev) => prev.map((session) => (session.id === sessionId ? updated : session)));
        return;
      }

      setSessions((prev) => {
        const next = prev.map((session) => (session.id === sessionId ? optimistic : session));
        persist({ sessions: next });
        return next;
      });
    },
    [sessions, myTeamIds, useDb, persist],
  );

  const promoteTeamPracticeSong = useCallback(
    async (songId: string) => {
      const target = teamPracticeSongs.find((song) => song.id === songId);
      if (!target || !canManageTeam(target.teamId)) {
        throw new Error('팀 리더만 변경할 수 있어요.');
      }

      const optimistic: TeamPracticeSong = {
        ...target,
        updatedAt: new Date().toISOString(),
        isCurrent: true,
      };

      if (useDb) {
        setTeamPracticeSongs((prev) => {
          const next = prev.map((song) => {
            if (song.teamId !== target.teamId) return song;
            if (song.id === songId) return optimistic;
            return { ...song, isCurrent: false };
          });
          saveTeamPracticeSongsCache(next);
          return next;
        });
        try {
          const updated = await promoteTeamPracticeSongInDb(songId, target.teamId);
          setTeamPracticeSongs((prev) => {
            const next = prev.map((song) => {
              if (song.teamId !== target.teamId) return song;
              if (song.id === songId) return updated;
              return { ...song, isCurrent: false };
            });
            saveTeamPracticeSongsCache(next);
            return next;
          });
        } catch (err) {
          if (!isMissingTeamPracticeSongsTable(err)) throw err;
        }
        return;
      }

      setTeamPracticeSongs((prev) => {
        const next = prev.map((song) => {
          if (song.teamId !== target.teamId) return song;
          if (song.id === songId) return optimistic;
          return { ...song, isCurrent: false };
        });
        persist({ teamPracticeSongs: next });
        return next;
      });
    },
    [teamPracticeSongs, canManageTeam, useDb, persist],
  );

  const deleteTeamPracticeSong = useCallback(
    (songId: string): Promise<boolean> => {
      const target = teamPracticeSongs.find((song) => song.id === songId);
      if (!target || !canManageTeam(target.teamId)) return Promise.resolve(false);
      if (!confirm(`"${target.title}" 연습곡을 삭제할까요?`)) {
        return Promise.resolve(false);
      }

      const removeLocal = () => {
        setTeamPracticeSongs((prev) => {
          const next = prev.filter((song) => song.id !== songId);
          if (useDb) saveTeamPracticeSongsCache(next);
          else persist({ teamPracticeSongs: next });
          return next;
        });
      };

      if (useDb && userId) {
        return deleteTeamPracticeSongInDb(songId)
          .then(() => {
            removeLocal();
            return true;
          })
          .catch((err) => {
            console.error('[BandCrew] deleteTeamPracticeSong failed', err);
            if (isMissingTeamPracticeSongsTable(err)) {
              removeLocal();
              return true;
            }
            return false;
          });
      }

      removeLocal();
      return Promise.resolve(true);
    },
    [teamPracticeSongs, canManageTeam, useDb, userId, persist],
  );

  const deleteSession = useCallback(
    (sessionId: string): Promise<boolean> => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target || !isOwnPracticeSession(target)) return Promise.resolve(false);
      if (!confirm(`"${target.title}" 세션을 삭제할까요? 트랙도 함께 삭제됩니다.`)) {
        return Promise.resolve(false);
      }

      const removeLocal = () => {
        ownSessionIdsRef.current.delete(sessionId);
        deleteSessionTracks(sessionId);
        setSessions((prev) => {
          const next = prev.filter((s) => s.id !== sessionId);
          if (!useDb) persist({ sessions: next });
          return next;
        });
      };

      if (useDb && userId) {
        return deletePracticeSessionInDb(sessionId, target.teamId)
          .then(() => {
            removeLocal();
            return true;
          })
          .catch((err) => {
            console.error('[BandCrew] deleteSession failed', err);
            return false;
          });
      }

      removeLocal();
      return Promise.resolve(true);
    },
    [sessions, isOwnPracticeSession, useDb, userId, persist],
  );

  const sendChatMessage = (payload: SendChatPayload, options?: { peerTeamId?: string }) => {
    if (!activeTeamId) return;
    const trimmedText = payload.text?.trim();
    if (payload.kind === 'text' && !trimmedText) return;
    if (payload.kind !== 'text' && !payload.mediaUrl) return;

    const member = activeTeam ? findCurrentMember(activeTeam, userProfile) : undefined;
    const authorNick = member?.nick ?? userProfile.name;
    const authorAvatar = member?.avatar ?? userProfile.avatar;
    const chatThreadId = options?.peerTeamId
      ? getCrossTeamThreadId(activeTeamId, options.peerTeamId)
      : undefined;

    if (useDb && userId) {
      void createChatMessageInDb(userId, {
        teamId: activeTeamId,
        chatThreadId,
        authorNick,
        authorAvatar,
        payload: {
          ...payload,
          text: trimmedText || undefined,
        },
      })
        .then((message) => {
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
        })
        .catch((err) => console.error('[BandCrew] sendChatMessage failed', err));
      return;
    }

    const message: ChatMessage = {
      id: `ch-${Date.now()}`,
      teamId: activeTeamId,
      chatThreadId,
      authorNick,
      authorAvatar,
      kind: payload.kind,
      text: trimmedText || undefined,
      mediaUrl: payload.mediaUrl,
      createdAt: new Date().toISOString(),
    };
    const next = [...chatMessages, message];
    setChatMessages(next);
    persist({ chatMessages: next });
  };

  const addStory = (input: Omit<Story, 'id' | 'createdAt'>) => {
    if (!canManageTeam(input.teamId)) return;
    if (useDb) {
      void createStoryInDb(input)
        .then((story) => setStories((prev) => [...prev, story]))
        .catch((err) => console.error('[BandCrew] addStory failed', err));
      return;
    }
    const story: Story = {
      ...input,
      id: `st-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const next = [...stories, story];
    setStories(next);
    persist({ stories: next });
  };

  const storiesToHighlightItems = (storyIds: string[], sourceStories: Story[]): HighlightItem[] => {
    return storyIds
      .map((storyId) => sourceStories.find((s) => s.id === storyId))
      .filter(Boolean)
      .map((story) => ({
        id: `hi-${story!.id}`,
        image: story!.image,
        caption: story!.caption,
        sourceStoryId: story!.id,
      }));
  };

  const createHighlight = (teamId: string, title: string, storyIds: string[]) => {
    if (!canManageTeam(teamId)) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle || storyIds.length === 0) return;

    if (useDb) {
      void createHighlightInDb(teamId, trimmedTitle, storyIds, stories)
        .then((highlight) => setHighlights((prev) => [...prev, highlight]))
        .catch((err) => console.error('[BandCrew] createHighlight failed', err));
      return;
    }

    const items = storiesToHighlightItems(storyIds, stories);
    if (items.length === 0) return;

    const highlight: TeamHighlight = {
      id: `hl-${Date.now()}`,
      teamId,
      title: trimmedTitle,
      coverImage: items[0].image,
      items,
      createdAt: new Date().toISOString(),
    };
    const next = [...highlights, highlight];
    setHighlights(next);
    persist({ highlights: next });
  };

  const updateHighlight = (
    highlightId: string,
    patch: { title?: string; storyIds?: string[] },
  ) => {
    const target = highlights.find((h) => h.id === highlightId);
    if (!target || !canManageTeam(target.teamId)) return;

    if (useDb) {
      void updateHighlightInDb(
        highlightId,
        {
          title: patch.title?.trim() || undefined,
          storyIds: patch.storyIds,
        },
        stories,
      )
        .then((updated) =>
          setHighlights((prev) => prev.map((h) => (h.id === highlightId ? updated : h))),
        )
        .catch((err) => console.error('[BandCrew] updateHighlight failed', err));
      return;
    }

    const next = highlights.map((highlight) => {
      if (highlight.id !== highlightId) return highlight;
      const nextTitle = patch.title?.trim() || highlight.title;
      const nextItems = patch.storyIds
        ? storiesToHighlightItems(patch.storyIds, stories)
        : highlight.items;
      if (nextItems.length === 0) return highlight;
      return {
        ...highlight,
        title: nextTitle,
        items: nextItems,
        coverImage: nextItems[0].image,
      };
    });
    setHighlights(next);
    persist({ highlights: next });
  };

  const appendStoriesToHighlight = (highlightId: string, storyIds: string[]) => {
    const target = highlights.find((h) => h.id === highlightId);
    if (!target || !canManageTeam(target.teamId) || storyIds.length === 0) return;

    if (useDb) {
      const existingSourceIds = target.items
        .map((item) => item.sourceStoryId || item.id.replace(/^hi-/, ''))
        .filter(Boolean) as string[];
      void appendHighlightStoriesInDb(highlightId, storyIds, stories, existingSourceIds)
        .then((updated) =>
          setHighlights((prev) => prev.map((h) => (h.id === highlightId ? updated : h))),
        )
        .catch((err) => console.error('[BandCrew] appendStoriesToHighlight failed', err));
      return;
    }

    const existingIds = new Set(
      target.items.map((item) => item.sourceStoryId || item.id.replace(/^hi-/, '')),
    );
    const newIds = storyIds.filter((id) => !existingIds.has(id));
    const newItems = storiesToHighlightItems(newIds, stories);
    if (newItems.length === 0) return;

    const next = highlights.map((highlight) => {
      if (highlight.id !== highlightId) return highlight;
      return {
        ...highlight,
        items: [...highlight.items, ...newItems],
      };
    });
    setHighlights(next);
    persist({ highlights: next });
  };

  const deleteHighlight = (highlightId: string) => {
    const target = highlights.find((h) => h.id === highlightId);
    if (!target || !canManageTeam(target.teamId)) return;
    const next = highlights.filter((h) => h.id !== highlightId);
    setHighlights(next);
    if (!useDb) persist({ highlights: next });
    if (useDb) {
      void deleteHighlightInDb(highlightId).catch((err) =>
        console.error('[BandCrew] deleteHighlight failed', err),
      );
    }
  };

  const updateTeamProfile = async (
    teamId: string,
    patch: { cover?: string; bio?: string; genre?: string; instagram?: string },
  ) => {
    if (!canManageTeam(teamId)) {
      throw new Error('권한이 없어요.');
    }
    const normalizedPatch = {
      ...patch,
      bio: patch.bio !== undefined ? normalizeTeamBio(patch.bio) : undefined,
      instagram:
        patch.instagram !== undefined ? normalizeInstagramUsername(patch.instagram) : undefined,
    };
    const seeded = cloneTeamForEdit(teamId, customTeams);
    const nextCustom = seeded.map((team) =>
      team.id === teamId
        ? {
            ...team,
            cover: normalizedPatch.cover ?? team.cover,
            bio: normalizedPatch.bio ?? team.bio,
            genre: normalizedPatch.genre?.trim() || team.genre,
            instagram:
              normalizedPatch.instagram !== undefined
                ? normalizedPatch.instagram || undefined
                : team.instagram,
          }
        : team,
    );
    setCustomTeams(nextCustom);
    if (!useDb) {
      persist({ customTeams: nextCustom });
      return;
    }

    await updateTeamProfileInDb(teamId, normalizedPatch);
    try {
      const team = await fetchTeamById(teamId);
      if (team) mergeTeam(team);
    } catch (err) {
      console.warn('[BandCrew] team refresh after profile update failed', err);
    }
  };

  const updateUserProfile = async (patch: {
    name?: string;
    avatar?: string;
    bio?: string;
    instagram?: string;
  }) => {
    const nextInstagram =
      patch.instagram !== undefined ? normalizeInstagramUsername(patch.instagram) : undefined;
    const nextUser: AppUser = {
      ...userProfile,
      name: patch.name?.trim() || userProfile.name,
      avatar: patch.avatar ?? userProfile.avatar,
      bio: patch.bio !== undefined ? patch.bio.trim() : userProfile.bio,
      instagram:
        nextInstagram !== undefined ? nextInstagram || undefined : userProfile.instagram,
    };
    let nextCustom = customTeams;
    if (activeTeamId) {
      nextCustom = cloneTeamForEdit(activeTeamId, customTeams);
      nextCustom = syncCurrentMember(
        nextCustom,
        activeTeamId,
        nextUser.name,
        nextUser.avatar,
        nextUser.bio,
        nextUser.instagram,
      );
    }
    setUserProfile(nextUser);
    setCustomTeams(nextCustom);
    if (!useDb) {
      persist({ userProfile: nextUser, customTeams: nextCustom });
      return;
    }

    if (isSupabaseConfigured && authRequired) {
      await updateRemoteProfile({
        name: nextUser.name,
        avatar: nextUser.avatar,
        bio: nextUser.bio,
        instagram: nextUser.instagram ?? '',
      });
      if (userId && activeTeamId) {
        await syncMemberProfileInDb(activeTeamId, userId, {
          nick: nextUser.name,
          avatar_url: nextUser.avatar,
          bio: nextUser.bio ?? '',
          instagram: nextUser.instagram ?? '',
        });
      }
    }
  };

  const updateMyPosition = (position: PositionId) => {
    if (!activeTeamId || !myTeamIds.includes(activeTeamId)) return;
    const seeded = cloneTeamForEdit(activeTeamId, customTeams);
    const nextCustom = seeded.map((team) => {
      if (team.id !== activeTeamId) return team;
      return {
        ...team,
        members: team.members.map((member) => {
          if (!isCurrentMember(member, userProfile)) return member;
          return { ...member, position };
        }),
      };
    });
    setCustomTeams(nextCustom);
    if (!useDb) persist({ customTeams: nextCustom });
    if (useDb && userId) {
      void updateMemberPositionInDb(activeTeamId, userId, position)
        .then(() => fetchTeamById(activeTeamId))
        .then((team) => {
          if (team) mergeTeam(team);
        })
        .catch((err) => console.error('[BandCrew] updateMyPosition failed', err));
    }
  };

  const addTeamAudio = (input: Omit<TeamAudioTrack, 'id' | 'createdAt' | 'comments' | 'likes' | 'likedByMe'>) => {
    if (!canManageTeam(input.teamId)) return;
    if (useDb && userId) {
      void createAudioTrackInDb(userId, input)
        .then((track) => setTeamAudios((prev) => [track, ...prev]))
        .catch((err) => console.error('[BandCrew] addTeamAudio failed', err));
      return;
    }
    const track: TeamAudioTrack = {
      ...input,
      id: `au-${Date.now()}`,
      likes: 0,
      likedByMe: false,
      comments: [],
      createdAt: new Date().toISOString(),
    };
    const next = [track, ...teamAudios];
    setTeamAudios(next);
    persist({ teamAudios: next });
  };

  const deleteTeamAudio = (trackId: string) => {
    const track = teamAudios.find((t) => t.id === trackId);
    if (!track || !canManageTeam(track.teamId)) return;
    const next = teamAudios.filter((t) => t.id !== trackId);
    setTeamAudios(next);
    if (!useDb) persist({ teamAudios: next });
    if (useDb) {
      void deleteAudioTrackInDb(trackId).catch((err) =>
        console.error('[BandCrew] deleteTeamAudio failed', err),
      );
    }
  };

  const generateTeamInviteCode = (teamId: string) => {
    if (!canManageTeam(teamId)) return;
    if (useDb) {
      void generateInviteCodeInDb(teamId)
        .then(({ code, createdAt }) => {
          setCustomTeams((prev) =>
            prev.map((team) =>
              team.id === teamId
                ? { ...team, inviteCode: code, inviteCodeCreatedAt: createdAt }
                : team,
            ),
          );
        })
        .catch((err) => console.error('[BandCrew] generateInviteCode failed', err));
      return;
    }
    const seeded = cloneTeamForEdit(teamId, customTeams);
    const createdAt = new Date().toISOString();
    const code = createRandomInviteCode();
    const nextCustom = seeded.map((team) =>
      team.id === teamId
        ? { ...team, inviteCode: code, inviteCodeCreatedAt: createdAt }
        : team,
    );
    setCustomTeams(nextCustom);
    persist({ customTeams: nextCustom });
  };

  const replaceTeamMembers = useCallback(
    (teamId: string, nextMembers: TeamMember[]) => {
      const seeded = cloneTeamForEdit(teamId, customTeams);
      const nextCustom = seeded.map((team) =>
        team.id === teamId ? { ...team, members: nextMembers } : team,
      );
      setCustomTeams(nextCustom);
      if (!useDb) persist({ customTeams: nextCustom });
      return nextCustom.find((team) => team.id === teamId);
    },
    [customTeams, persist, useDb],
  );

  const transferTeamLeadership = useCallback(
    async (memberId: string): Promise<{ ok: boolean; message: string }> => {
      if (!activeTeamId) return { ok: false, message: '팀이 없어요.' };
      const team = teams.find((t) => t.id === activeTeamId);
      if (!team || !isTeamLeader(team, userProfile)) {
        return { ok: false, message: '리더만 넘길 수 있어요.' };
      }
      const target = team.members.find((member) => member.id === memberId);
      if (!target) return { ok: false, message: '멤버를 찾을 수 없어요.' };
      if (target.isLeader) return { ok: false, message: '이미 리더예요.' };

      if (useDb && userId) {
        try {
          const updated = await transferTeamLeadershipInDb(activeTeamId, userId, memberId);
          mergeTeam(updated);
          return { ok: true, message: `${target.nick}에게 리더를 넘겼어요.` };
        } catch (err) {
          return {
            ok: false,
            message: err instanceof Error ? err.message : '리더를 넘기지 못했어요.',
          };
        }
      }

      const me = findCurrentMember(team, userProfile);
      const nextMembers = team.members.map((member) => {
        if (member.id === memberId) {
          return { ...member, isLeader: true, isCoLeader: false };
        }
        if (member.id === me?.id) {
          return { ...member, isLeader: false };
        }
        return { ...member, isLeader: false };
      });
      replaceTeamMembers(activeTeamId, nextMembers);
      return { ok: true, message: `${target.nick}에게 리더를 넘겼어요.` };
    },
    [activeTeamId, teams, userProfile, useDb, userId, replaceTeamMembers],
  );

  const setTeamCoLeader = useCallback(
    async (memberId: string | null): Promise<{ ok: boolean; message: string }> => {
      if (!activeTeamId) return { ok: false, message: '팀이 없어요.' };
      const team = teams.find((t) => t.id === activeTeamId);
      if (!team || !isTeamLeader(team, userProfile)) {
        return { ok: false, message: '리더만 코리더를 지정할 수 있어요.' };
      }

      if (memberId) {
        const target = team.members.find((member) => member.id === memberId);
        if (!target) return { ok: false, message: '멤버를 찾을 수 없어요.' };
        if (target.isLeader) return { ok: false, message: '리더는 코리더로 지정할 수 없어요.' };
      }

      if (useDb && userId) {
        try {
          const updated = await setTeamCoLeaderInDb(activeTeamId, userId, memberId);
          mergeTeam(updated);
          if (memberId) {
            const nick = updated.members.find((member) => member.id === memberId)?.nick ?? '멤버';
            return { ok: true, message: `${nick}을(를) 코리더로 지정했어요.` };
          }
          return { ok: true, message: '코리더를 해제했어요.' };
        } catch (err) {
          return {
            ok: false,
            message: err instanceof Error ? err.message : '코리더 설정에 실패했어요.',
          };
        }
      }

      const nextMembers = team.members.map((member) => {
        if (member.isLeader) return { ...member, isCoLeader: false };
        if (!memberId) return { ...member, isCoLeader: false };
        return { ...member, isCoLeader: member.id === memberId };
      });
      replaceTeamMembers(activeTeamId, nextMembers);
      if (memberId) {
        const nick = team.members.find((member) => member.id === memberId)?.nick ?? '멤버';
        return { ok: true, message: `${nick}을(를) 코리더로 지정했어요.` };
      }
      return { ok: true, message: '코리더를 해제했어요.' };
    },
    [activeTeamId, teams, userProfile, useDb, userId, replaceTeamMembers],
  );

  const getTeam = (id: string) => teams.find((t) => t.id === id);

  const getTeamFollowers = useCallback(
    (teamId: string) => {
      const ids = followerIdsByTeam[teamId] ?? [];
      return ids.map((id) => teams.find((t) => t.id === id)).filter(Boolean) as BandTeam[];
    },
    [followerIdsByTeam, teams],
  );

  const getTeamFollowing = useCallback(
    (teamId: string) => {
      const ids =
        myTeamIds.includes(teamId) && (!useDb || teamId === activeTeamId)
          ? followingIds
          : useDb
            ? []
            : INITIAL_TEAM_FOLLOWING[teamId] ?? [];
      return ids.map((id) => teams.find((t) => t.id === id)).filter(Boolean) as BandTeam[];
    },
    [myTeamIds, followingIds, teams, useDb, activeTeamId],
  );

  const value: AppState = {
    user,
    teams,
    activeTeamId,
    myTeamIds,
    followingIds,
    posts,
    events,
    sessions,
    teamPracticeSongs,
    stories: activeStories,
    highlights,
    teamAudios,
    chatMessages,
    activeTeam,
    dataLoading,
    dataReady,
    isActiveTeamLeader,
    canManageActiveTeam,
    canManageTeam,
    transferTeamLeadership,
    setTeamCoLeader,
    refreshAppData,
    loadTeam,
    createTeam,
    joinTeam,
    leaveTeam,
    setActiveTeam,
    toggleFollow,
    addPost,
    deletePost,
    toggleLike,
    addComment,
    addAudioComment,
    updateAudioComment,
    deleteAudioComment,
    toggleAudioCommentLike,
    toggleAudioLike,
    updateComment,
    deleteComment,
    toggleCommentLike,
    addEvent,
    deleteEvent,
    addSession,
    addTeamPracticeSong,
    updatePracticeSession,
    promoteTeamPracticeSong,
    loadTeamPracticeSongs,
    isOwnPracticeSession,
    isOwnTeamPracticeSong,
    deleteSession,
    deleteTeamPracticeSong,
    sendChatMessage,
    addStory,
    createHighlight,
    updateHighlight,
    appendStoriesToHighlight,
    deleteHighlight,
    updateTeamProfile,
    updateUserProfile,
    updateMyPosition,
    generateTeamInviteCode,
    addTeamAudio,
    deleteTeamAudio,
    getTeam,
    getTeamFollowers,
    getTeamFollowing,
    searchTeams,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
