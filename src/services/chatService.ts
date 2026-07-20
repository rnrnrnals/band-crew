import type { ChatMessage, SendChatPayload } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapChat } from '../lib/supabaseMappers';
import { getCrossTeamThreadId } from '../utils/chatUtils';

type DbChatRow = {
  id: string;
  team_id: string;
  chat_thread_id: string | null;
  author_user_id: string;
  author_nick: string;
  author_avatar_url: string;
  kind: NonNullable<ChatMessage['kind']>;
  text: string | null;
  media_url: string | null;
  created_at: string;
};

function mapRow(row: DbChatRow): ChatMessage {
  return mapChat(row);
}

export async function fetchChatForTeamIds(teamIds: string[]): Promise<ChatMessage[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const threadIds = [...buildChatThreadIds(teamIds)];

  const queries = [
    supabase.from(DB_TABLES.chatMessages).select('*').in('team_id', teamIds).is('chat_thread_id', null),
  ];
  if (threadIds.length > 0) {
    queries.push(supabase.from(DB_TABLES.chatMessages).select('*').in('chat_thread_id', threadIds));
  }

  const results = await Promise.all(queries);
  const byId = new Map<string, ChatMessage>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of (result.data ?? []) as DbChatRow[]) {
      byId.set(row.id, mapRow(row));
    }
  }

  return [...byId.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

function buildChatThreadIds(teamIds: string[]): Set<string> {
  const threadIds = new Set<string>();
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      threadIds.add(getCrossTeamThreadId(teamIds[i], teamIds[j]));
    }
  }
  return threadIds;
}

export function chatMessageMatchesTeams(row: DbChatRow, teamIds: string[]): boolean {
  if (teamIds.length === 0) return false;
  const teamSet = new Set(teamIds);
  if (row.chat_thread_id) {
    return buildChatThreadIds(teamIds).has(row.chat_thread_id);
  }
  return teamSet.has(row.team_id);
}

export function subscribeChatMessages(
  teamIds: string[],
  onMessage: (message: ChatMessage) => void,
): () => void {
  const supabase = requireSupabase();
  const uniqueTeamIds = [...new Set(teamIds)];

  const channel = supabase
    .channel(`chat-messages-${uniqueTeamIds.sort().join('-') || 'none'}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: DB_TABLES.chatMessages },
      (payload) => {
        const row = payload.new as DbChatRow;
        if (!chatMessageMatchesTeams(row, uniqueTeamIds)) return;
        onMessage(mapRow(row));
      },
    )
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[BandCrew] chat realtime subscription issue', status, err);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function createChatMessageInDb(
  userId: string,
  input: {
    teamId: string;
    chatThreadId?: string;
    authorNick: string;
    authorAvatar?: string;
    payload: SendChatPayload;
  },
): Promise<ChatMessage> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.chatMessages)
    .insert({
      team_id: input.teamId,
      chat_thread_id: input.chatThreadId ?? null,
      author_user_id: userId,
      author_nick: input.authorNick,
      author_avatar_url: input.authorAvatar ?? '',
      kind: input.payload.kind,
      text: input.payload.text ?? null,
      media_url: input.payload.mediaUrl ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('메시지 전송 실패');
  return mapRow(data as DbChatRow);
}
