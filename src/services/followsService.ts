import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';

export async function fetchFollowsForTeam(followerTeamId: string): Promise<string[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teamFollows)
    .select('following_team_id')
    .eq('follower_team_id', followerTeamId);

  if (error) throw error;
  return (data ?? []).map((row) => row.following_team_id as string);
}

export async function fetchFollowersMap(teamIds: string[]): Promise<Record<string, string[]>> {
  if (teamIds.length === 0) return {};
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teamFollows)
    .select('follower_team_id, following_team_id')
    .in('following_team_id', teamIds);

  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const followingId = row.following_team_id as string;
    const followerId = row.follower_team_id as string;
    const list = map[followingId] ?? [];
    list.push(followerId);
    map[followingId] = list;
  }
  return map;
}

export async function toggleFollowInDb(
  followerTeamId: string,
  followingTeamId: string,
  follow: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (follow) {
    const { error } = await supabase.from(DB_TABLES.teamFollows).insert({
      follower_team_id: followerTeamId,
      following_team_id: followingTeamId,
    });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from(DB_TABLES.teamFollows)
      .delete()
      .eq('follower_team_id', followerTeamId)
      .eq('following_team_id', followingTeamId);
    if (error) throw error;
  }
}
