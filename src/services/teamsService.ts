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
import { INSTAGRAM_COLUMN_MISSING_MESSAGE, isMissingInstagramColumnError } from '../utils/dbErrors';

const DEFAULT_COVER = '';
const TEAM_NAME_TAKEN_MESSAGE = '이미 사용 중인 팀 이름이에요.';

export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

export async function isTeamNameTaken(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teams)
    .select('id')
    .ilike('name', trimmed)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function formatTeamMutationError(err: unknown, fallback: string): string {
  const message =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : err instanceof Error
        ? err.message
        : fallback;

  if (/profiles.*foreign key|team_members_user_id_fkey/i.test(message)) {
    return '프로필이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.';
  }
  if (/team_members_team_id_nick_key|duplicate key.*nick/i.test(message)) {
    return '이 팀에서 이미 사용 중인 닉네임이에요.';
  }
  if (/team name already exists|teams_name_key|duplicate key.*name/i.test(message)) {
    return TEAM_NAME_TAKEN_MESSAGE;
  }
  if (/row-level security|permission denied|42501/i.test(message)) {
    return '권한이 없어요. 다시 로그인한 뒤 시도해 주세요.';
  }
  if (/column .* does not exist/i.test(message)) {
    return 'DB 마이그레이션이 아직 적용되지 않았어요. Supabase SQL을 실행해 주세요.';
  }

  return message || fallback;
}

function isMissingRpcFunction(err: unknown): boolean {
  const message =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : '';
  const code =
    err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : '';
  return (
    code === 'PGRST202' ||
    /Could not find the function/i.test(message) ||
    /function .* does not exist/i.test(message)
  );
}

async function ensureUserProfileInDb(userId: string, user: AppUser): Promise<void> {
  const supabase = requireSupabase();
  const { data, error: readError } = await supabase
    .from(DB_TABLES.profiles)
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (readError) throw readError;
  if (data) return;

  const { error: insertError } = await supabase.from(DB_TABLES.profiles).insert({
    id: userId,
    display_name: user.name.trim() || 'User',
    avatar_url: user.avatar ?? '',
    bio: user.bio ?? '',
  });

  if (insertError) throw insertError;
}

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

export async function searchTeamsByName(query: string, limit = 12): Promise<BandTeam[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = requireSupabase();
  const safe = trimmed.replace(/[%_]/g, '');
  if (!safe) return [];

  const { data: teamRows, error } = await supabase
    .from(DB_TABLES.teams)
    .select('*')
    .ilike('name', `%${safe}%`)
    .order('name')
    .limit(limit);

  if (error) throw error;

  const ids = ((teamRows ?? []) as DbTeam[]).map((row) => row.id);
  if (ids.length === 0) return [];

  const membersByTeam = await fetchMembersForTeams(ids);
  return ((teamRows ?? []) as DbTeam[]).map((row) =>
    mapTeam(row, membersByTeam.get(row.id) ?? []),
  );
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

async function createTeamInDbDirect(
  userId: string,
  user: AppUser,
  name: string,
  genre: string,
  nick: string,
  position: PositionId,
): Promise<BandTeam> {
  const supabase = requireSupabase();

  await ensureUserProfileInDb(userId, user);

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

  if (teamError || !teamRow) {
    throw new Error(formatTeamMutationError(teamError, '팀 생성에 실패했어요.'));
  }

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

  if (memberError || !memberRow) {
    await supabase.from(DB_TABLES.teams).delete().eq('id', teamRow.id);
    throw new Error(formatTeamMutationError(memberError, '멤버 등록에 실패했어요.'));
  }

  const { error: profileError } = await supabase
    .from(DB_TABLES.profiles)
    .update({ active_team_id: teamRow.id })
    .eq('id', userId);

  if (profileError) {
    throw new Error(formatTeamMutationError(profileError, '활성 팀 설정에 실패했어요.'));
  }

  return mapTeam(teamRow as DbTeam, [memberRow as DbTeamMember]);
}

export async function createTeamInDb(
  userId: string,
  user: AppUser,
  name: string,
  genre: string,
  nick: string,
  position: PositionId,
): Promise<BandTeam> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('팀 이름을 입력해주세요.');
  if (await isTeamNameTaken(trimmedName)) {
    throw new Error(TEAM_NAME_TAKEN_MESSAGE);
  }

  const supabase = requireSupabase();

  const { data: teamId, error: rpcError } = await supabase.rpc('create_team_with_leader', {
    p_name: name.trim(),
    p_genre: genre.trim() || '장르 미정',
    p_nick: nick.trim(),
    p_position: position,
    p_avatar_url: user.avatar ?? '',
    p_bio: user.bio ?? '',
  });

  if (!rpcError && typeof teamId === 'string' && teamId) {
    const team = await fetchTeamById(teamId);
    if (team) return team;
    throw new Error('팀을 만들었지만 불러오지 못했어요.');
  }

  if (rpcError && !isMissingRpcFunction(rpcError)) {
    throw new Error(formatTeamMutationError(rpcError, '팀 생성에 실패했어요.'));
  }

  return createTeamInDbDirect(userId, user, name, genre, nick, position);
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
    try {
      await ensureUserProfileInDb(userId, user);
    } catch (err) {
      return { ok: false, message: formatTeamMutationError(err, '프로필 준비에 실패했어요.') };
    }

    const { error: joinError } = await supabase.from(DB_TABLES.teamMembers).insert({
      team_id: teamRow.id,
      user_id: userId,
      nick: nick.trim(),
      position,
      avatar_url: user.avatar,
      bio: user.bio ?? '',
      is_leader: false,
    });
    if (joinError) {
      return { ok: false, message: formatTeamMutationError(joinError, '가입에 실패했어요.') };
    }
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

async function deleteEmptyTeamInDb(teamId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('delete_empty_team', { p_team_id: teamId });
  if (error && !isMissingRpcFunction(error)) {
    throw error;
  }
}

export async function cleanupEmptyTeamsInDb(): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('cleanup_empty_teams');
  if (error && !isMissingRpcFunction(error)) {
    console.warn('[BandCrew] cleanupEmptyTeams failed', error.message);
  }
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

  await deleteEmptyTeamInDb(teamId);

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
  patch: { cover?: string; bio?: string; genre?: string; instagram?: string },
): Promise<void> {
  const supabase = requireSupabase();
  const updates: Record<string, string> = {};
  if (patch.cover !== undefined) updates.cover_url = patch.cover;
  if (patch.bio !== undefined) updates.bio = patch.bio;
  if (patch.genre !== undefined) updates.genre = patch.genre;
  if (patch.instagram !== undefined) updates.instagram = patch.instagram;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from(DB_TABLES.teams).update(updates).eq('id', teamId);
  if (error && updates.instagram !== undefined && isMissingInstagramColumnError(error.message)) {
    const { instagram: _ignored, ...rest } = updates;
    if (Object.keys(rest).length > 0) {
      const { error: retryError } = await supabase.from(DB_TABLES.teams).update(rest).eq('id', teamId);
      if (retryError) throw new Error(formatTeamMutationError(retryError, '팀 프로필 저장에 실패했어요.'));
    }
    throw new Error(INSTAGRAM_COLUMN_MISSING_MESSAGE);
  }
  if (error) throw new Error(formatTeamMutationError(error, '팀 프로필 저장에 실패했어요.'));
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
  patch: { nick?: string; avatar_url?: string; bio?: string; instagram?: string },
): Promise<void> {
  const supabase = requireSupabase();
  const updates: Record<string, string> = {};
  if (patch.nick !== undefined) updates.nick = patch.nick;
  if (patch.avatar_url !== undefined) updates.avatar_url = patch.avatar_url;
  if (patch.bio !== undefined) updates.bio = patch.bio;
  if (patch.instagram !== undefined) updates.instagram = patch.instagram;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from(DB_TABLES.teamMembers)
    .update(updates)
    .eq('team_id', teamId)
    .eq('user_id', userId);

  if (error && updates.instagram !== undefined && isMissingInstagramColumnError(error.message)) {
    const { instagram: _ignored, ...rest } = updates;
    if (Object.keys(rest).length > 0) {
      const { error: retryError } = await supabase
        .from(DB_TABLES.teamMembers)
        .update(rest)
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (retryError) {
        throw new Error(formatTeamMutationError(retryError, '멤버 프로필 저장에 실패했어요.'));
      }
    }
    throw new Error(INSTAGRAM_COLUMN_MISSING_MESSAGE);
  }

  if (error) throw new Error(formatTeamMutationError(error, '멤버 프로필 저장에 실패했어요.'));
}

async function assertTeamLeader(teamId: string, userId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teamMembers)
    .select('is_leader')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.is_leader) throw new Error('리더만 할 수 있어요.');
}

export async function transferTeamLeadershipInDb(
  teamId: string,
  fromUserId: string,
  toMemberId: string,
): Promise<BandTeam> {
  const supabase = requireSupabase();
  await assertTeamLeader(teamId, fromUserId);

  const { data: target, error: targetError } = await supabase
    .from(DB_TABLES.teamMembers)
    .select('id, user_id, is_leader')
    .eq('id', toMemberId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error('멤버를 찾을 수 없어요.');
  if (target.is_leader) throw new Error('이미 리더예요.');

  const { error: demoteError } = await supabase
    .from(DB_TABLES.teamMembers)
    .update({ is_leader: false })
    .eq('team_id', teamId)
    .eq('user_id', fromUserId);
  if (demoteError) throw demoteError;

  const { error: promoteError } = await supabase
    .from(DB_TABLES.teamMembers)
    .update({ is_leader: true, is_co_leader: false })
    .eq('id', toMemberId);
  if (promoteError) throw promoteError;

  const team = await fetchTeamById(teamId);
  if (!team) throw new Error('팀을 불러오지 못했어요.');
  return team;
}

export async function setTeamCoLeaderInDb(
  teamId: string,
  leaderUserId: string,
  memberId: string | null,
): Promise<BandTeam> {
  const supabase = requireSupabase();
  await assertTeamLeader(teamId, leaderUserId);

  const { error: clearError } = await supabase
    .from(DB_TABLES.teamMembers)
    .update({ is_co_leader: false })
    .eq('team_id', teamId)
    .eq('is_co_leader', true);
  if (clearError) throw clearError;

  if (memberId) {
    const { data: target, error: targetError } = await supabase
      .from(DB_TABLES.teamMembers)
      .select('id, is_leader')
      .eq('id', memberId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error('멤버를 찾을 수 없어요.');
    if (target.is_leader) throw new Error('리더는 코리더로 지정할 수 없어요.');

    const { error: setError } = await supabase
      .from(DB_TABLES.teamMembers)
      .update({ is_co_leader: true })
      .eq('id', memberId);
    if (setError) throw setError;
  }

  const team = await fetchTeamById(teamId);
  if (!team) throw new Error('팀을 불러오지 못했어요.');
  return team;
}
