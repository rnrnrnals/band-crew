export const TEAM_BIO_MAX_CHARS = 100;
export const TEAM_BIO_MAX_LINES = 4;

export function clampTeamBio(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').slice(0, TEAM_BIO_MAX_LINES);
  let text = lines.join('\n');
  if (text.length > TEAM_BIO_MAX_CHARS) {
    text = text.slice(0, TEAM_BIO_MAX_CHARS);
  }
  return text;
}

export function normalizeTeamBio(value: string): string {
  return clampTeamBio(value).trim();
}
