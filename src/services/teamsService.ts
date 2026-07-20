import type { AppUser, BandTeam, PositionId } from '../types';
import { DEMO_JOIN_CODE } from '../mock/data';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import {
  mapTeam,
  type DbTeam,
  type DbTeamMember,
} from '../lib/supabaseMappers';
import { isInviteCodeActive } from '../utils/inviteUtils';
import { createRandomInviteCode } from '../utils/inviteUtils';

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800&h=500&fit=crop';

async function fetchMembersForTeams(teamIds: string[]): Promise<Map<string, DbTeamMember[]>> {
  if (teamIds.length === 0) return new Map();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teamMembers)
    .select('*')
    .in('team_id', teamIds);

  if (error) throw error;

  const map = new Map<string, DbTeamMember[]>();
  for (const row of (data ?? []) as DbTeamMember[]) {
    const list = map.get(row.team_id) ?? [];
    list.push(row);
    map.set(row.team_id, list);
  }
  return map;
}

export async function fetchTeamsByIds(teamIds: string[]): Promise<BandTeam[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();
  const { data: teamRows, error } = await supabase
    .from(DB_TABLES.teams)
    .select('*')
    .in('id', teamIds);

  if (error) throw error;
  const membersByTeam = await fetchMembersForTeams(teamIds);
  return ((teamRows ?? []) as DbTeam[]).map((row) =>
    mapTeam(row, membersByTeam.get(row.id) ?? []),
  );
}

export async function fetchTeamById(teamId: string): Promise<BandTeam | null> {
  const teams = await fetchTeamsByIds([teamId]);
  return teams[0] ?? null;
}

export async function fetchMyTeams(userId: string): Promise<{
  teams: BandTeam[];
  myTeamIds: string[];
  activeTeamId: string | null;
}> {
  const supabase = requireSupabase();

  const [{ data: memberships, error: memberError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase.from(DB_TABLES.teamMembers).select('team_id').eq('user_id', userId),
      supabase.from(DB_TABLES.profiles).select('active_team_id').eq('id', userId).maybeSingle(),
    ]);

  if (memberError) throw memberError;
  if (profileError) throw profileError;

  const myTeamIds = [...new Set((memberships ?? []).map((m) => m.team_id as string))];
  const teams = await fetchTeamsByIds(myTeamIds);
  const activeTeamId = (profile?.active_team_id as string | null) ?? myTeamIds[0] ?? null;

  return { teams, myTeamIds, activeTeamId };
}

export async function createTeamInDb(
  userId: string,
  user: AppUser,
  name: string,
  genre: string,
  nick: string,
  position: PositionId,
): Promise<BandTeam> {
  const supabase = requireSupabase();

  const { data: teamRow, error: teamError } = await supabase
    .from(DB_TABLES.teams)
    .insert({
      name: name.trim(),
      genre: genre.trim() || '장르 미정',
      bio: '새로 만든 밴드팀입니다.',
      cover_url: DEFAULT_COVER,
    })
    .select('*')
    .single();

  if (teamError || !teamRow) throw teamError ?? new Error('팀 생성 실패');

  const { data: memberRow, error: memberError } = await supabase
    .from(DB_TABLES.teamMembers)
    .insert({
      team_id: teamRow.id,
      user_id: userId,
      nick: nick.trim(),
      position,
      avatar_url: user.avatar,
      bio: user.bio ?? '',
      is_leader: true,
    })
    .select('*')
    .single();

  if (memberError || !memberRow) throw memberError ?? new Error('멤버 등록 실패');

  const { error: profileError } = await supabase
    .from(DB_TABLES.profiles)
    .update({ active_team_id: teamRow.id })
    .eq('id', userId);

  if (profileError) throw profileError;

  return mapTeam(teamRow as DbTeam, [memberRow as DbTeamMember]);
}

export async function joinTeamInDb(
  userId: string,
  user: AppUser,
  code: string,
  nick: string,
  position: PositionId,
): Promise<{ ok: boolean; message: string; team?: BandTeam }> {
  const supabase = requireSupabase();
  const normalized = code.trim().toUpperCase();

  let teamRow: DbTeam | null = null;

  if (normalized === DEMO_JOIN_CODE) {
    const { data } = await supabase
      .from(DB_TABLES.teams)
      .select('*')
      .eq('invite_code', DEMO_JOIN_CODE)
      .maybeSingle();
    teamRow = (data as DbTeam | null) ?? null;
    if (!teamRow) {
      return {
        ok: false,
        message: '데모 팀이 아직 없어요. supabase/seed.sql 을 실행하거나 팀을 직접 만들어 주세요.',
      };
    }
  } else {
    const { data } = await supabase
      .from(DB_TABLES.teams)
      .select('*')
      .ilike('invite_code', normalized)
      .maybeSingle();
    teamRow = (data as DbTeam | null) ?? null;
  }

  if (!teamRow) {
    return { ok: false, message: '초대 코드를 찾을 수 없어요.' };
  }

  const team = mapTeam(teamRow, []);
  if (team.inviteCode && !isInviteCodeActive(team)) {
    return { ok: false, message: '만료된 초대 코드예요. 팀에서 새 코드를 받아 주세요.' };
  }

  const { data: existing } = await supabase
    .from(DB_TABLES.teamMembers)
    .select('id')
    .eq('team_id', teamRow.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    const { error: joinError } = await supabase.from(DB_TABLES.teamMembers).insert({
      team_id: teamRow.id,
      user_id: userId,
      nick: nick.trim(),
      position,
      avatar_url: user.avatar,
      bio: user.bio ?? '',
      is_leader: false,
    });
    if (joinError) return { ok: false, message: joinError.message };
  }

  const { error: profileError } = await supabase
    .from(DB_TABLES.profiles)
    .update({ active_team_id: teamRow.id })
    .eq('id', userId);

  if (profileError) return { ok: false, message: profileError.message };

  const fullTeam = await fetchTeamById(teamRow.id);
  return { ok: true, message: `${teamRow.name}에 가입했어요!`, team: fullTeam ?? undefined };
}

export async function setActiveTeamInDb(userId: string, teamId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from(DB_TABLES.profiles)
    .update({ active_team_id: teamId })
    .eq('id', userId);
  if (error) throw error;
}

export async function leaveTeamInDb(
  userId: string,
  teamId: string,
): Promise<{ ok: boolean; message: string; nextActiveTeamId: string | null }> {
  const supabase = requireSupabase();

  const { data: member, error: memberError } = await supabase
    .from(DB_TABLES.teamMembers)
    .select('is_leader')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) {
    return { ok: false, message: '이 팀의 멤버가 아니에요.', nextActiveTeamId: null };
  }

  const { count, error: countError } = await supabase
    .from(DB_TABLES.teamMembers)
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (countError) throw countError;

  if (member.is_leader && (count ?? 0) > 1) {
    return {
      ok: false,
      message: '리더는 다른 멤버에게 리더를 넘긴 뒤 나갈 수 있어요.',
      nextActiveTeamId: null,
    };
  }

  const { error: deleteError } = await supabase
    .from(DB_TABLES.teamMembers)
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  const { data: profile, error: profileError } = await supabase
    .from(DB_TABLES.profiles)
    .select('active_team_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  let nextActiveTeamId = (profile?.active_team_id as string | null) ?? null;
  if (nextActiveTeamId === teamId) {
    const { data: rest, error: restError } = await supabase
      .from(DB_TABLES.teamMembers)
      .select('team_id')
      .eq('user_id', userId);
    if (restError) throw restError;
    nextActiveTeamId = (rest?.[0]?.team_id as string | undefined) ?? null;

    const { error: updateError } = await supabase
      .from(DB_TABLES.profiles)
      .update({ active_team_id: nextActiveTeamId })
      .eq('id', userId);
    if (updateError) throw updateError;
  }

  return { ok: true, message: '팀에서 나갔어요.', nextActiveTeamId };
}

export async function updateTeamProfileInDb(
  teamId: string,
  patch: { cover?: string; bio?: string; genre?: string },
): Promise<void> {
  const supabase = requireSupabase();
  const updates: Record<string, string> = {};
  if (patch.cover !== undefined) updates.cover_url = patch.cover;
  if (patch.bio !== undefined) updates.bio = patch.bio;
  if (patch.genre !== undefined) updates.genre = patch.genre;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from(DB_TABLES.teams).update(updates).eq('id', teamId);
  if (error) throw error;
}

export async function generateInviteCodeInDb(teamId: string): Promise<{ code: string; createdAt: string }> {
  const supabase = requireSupabase();
  const code = createRandomInviteCode();
  const createdAt = new Date().toISOString();
  const { error } = await supabase
    .from(DB_TABLES.teams)
    .update({ invite_code: code, invite_code_created_at: createdAt })
    .eq('id', teamId);
  if (error) throw error;
  return { code, createdAt };
}

export async function updateMemberPositionInDb(
  teamId: string,
  userId: string,
  position: PositionId,
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from(DB_TABLES.teamMembers)
    .update({ position })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function syncMemberProfileInDb(
  teamId: string,
  userId: string,
  patch: { nick?: string; avatar_url?: string; bio?: string },
): Promise<void> {
  const supabase = requireSupabase();
  const updates: Record<string, string> = {};
  if (patch.nick !== undefined) updates.nick = patch.nick;
  if (patch.avatar_url !== undefined) updates.avatar_url = patch.avatar_url;
  if (patch.bio !== undefined) updates.bio = patch.bio;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from(DB_TABLES.teamMembers)
    .update(updates)
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
}
