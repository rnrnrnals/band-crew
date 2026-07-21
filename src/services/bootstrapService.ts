import type {
  BandTeam,
  ChatMessage,
  Post,
  PracticeSessionMeta,
  ScheduleEvent,
  Story,
  TeamAudioTrack,
  TeamHighlight,
  TeamPracticeSong,
} from '../types';
import { fetchAudioForTeamIds, fetchDiscoverAudio } from './audioService';
import { fetchChatForTeamIds } from './chatService';
import { fetchFollowersMap, fetchFollowsForTeam } from './followsService';
import { fetchHighlightsForTeamIds } from './highlightsService';
import { fetchDiscoverPosts, fetchPostsForTeamIds } from './postsService';
import { fetchPracticeSessionsForTeamIds } from './practiceService';
import { fetchTeamPracticeSongsForTeamIds } from './teamPracticeSongService';
import { fetchScheduleForTeamIds } from './scheduleService';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchStoriesForTeamIds, purgeExpiredStoriesInDb } from './storiesService';
import { fetchMyTeams, fetchTeamsByIds } from './teamsService';

export interface BootstrapData {
  teams: BandTeam[];
  myTeamIds: string[];
  activeTeamId: string | null;
  followingIds: string[];
  followerIdsByTeam: Record<string, string[]>;
  posts: Post[];
  teamAudios: TeamAudioTrack[];
  stories: Story[];
  highlights: TeamHighlight[];
  events: ScheduleEvent[];
  sessions: PracticeSessionMeta[];
  teamPracticeSongs: TeamPracticeSong[];
  chatMessages: ChatMessage[];
}

export async function bootstrapUserData(userId: string): Promise<BootstrapData> {
  if (isSupabaseConfigured) {
    try {
      await purgeExpiredStoriesInDb();
    } catch (err) {
      console.warn('[BandCrew] expired story purge failed', err);
    }
  }

  const { teams, myTeamIds, activeTeamId } = await fetchMyTeams(userId);

  const followingIds = activeTeamId ? await fetchFollowsForTeam(activeTeamId) : [];

  const feedTeamIds = [...new Set([...myTeamIds, ...followingIds])];
  const allKnownTeamIds = [...new Set([...feedTeamIds, ...teams.map((t) => t.id)])];
  const chatTeamIds = [...new Set([...myTeamIds, ...followingIds, ...(activeTeamId ? [activeTeamId] : [])])];

  const [
    extraTeams,
    circlePosts,
    discoverPosts,
    circleAudios,
    discoverAudios,
    followerIdsByTeam,
    stories,
    highlights,
    events,
    sessions,
    teamPracticeSongs,
    chatMessages,
  ] = await Promise.all([
    fetchTeamsByIds(followingIds.filter((id) => !teams.some((t) => t.id === id))),
    fetchPostsForTeamIds(feedTeamIds, userId),
    fetchDiscoverPosts(userId, feedTeamIds),
    fetchAudioForTeamIds(feedTeamIds, userId),
    fetchDiscoverAudio(userId, feedTeamIds),
    fetchFollowersMap(allKnownTeamIds),
    fetchStoriesForTeamIds(feedTeamIds),
    fetchHighlightsForTeamIds(feedTeamIds),
    fetchScheduleForTeamIds(myTeamIds),
    fetchPracticeSessionsForTeamIds(myTeamIds),
    fetchTeamPracticeSongsForTeamIds(myTeamIds).catch((err) => {
      console.warn('[BandCrew] team practice songs bootstrap skipped', err);
      return [] as TeamPracticeSong[];
    }),
    fetchChatForTeamIds(chatTeamIds),
  ]);

  const postMap = new Map<string, Post>();
  for (const post of [...circlePosts, ...discoverPosts]) postMap.set(post.id, post);
  const posts = [...postMap.values()];

  const audioMap = new Map<string, TeamAudioTrack>();
  for (const track of [...circleAudios, ...discoverAudios]) audioMap.set(track.id, track);
  const teamAudios = [...audioMap.values()];

  const discoverTeamIds = [
    ...new Set([
      ...discoverPosts.map((p) => p.teamId),
      ...discoverAudios.map((a) => a.teamId),
    ]),
  ].filter((id) => !teams.some((t) => t.id === id) && !extraTeams.some((t) => t.id === id));

  const discoverTeams = discoverTeamIds.length ? await fetchTeamsByIds(discoverTeamIds) : [];

  const teamMap = new Map<string, BandTeam>();
  [...teams, ...extraTeams, ...discoverTeams].forEach((t) => teamMap.set(t.id, t));

  return {
    teams: Array.from(teamMap.values()),
    myTeamIds,
    activeTeamId,
    followingIds,
    followerIdsByTeam,
    posts,
    teamAudios,
    stories,
    highlights,
    events,
    sessions,
    teamPracticeSongs,
    chatMessages,
  };
}
