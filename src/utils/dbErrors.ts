export const INSTAGRAM_COLUMN_MISSING_MESSAGE =
  '인스타그램 아이디 저장 기능이 아직 데이터베이스에 적용되지 않았어요. Supabase SQL Editor에서 instagram 마이그레이션(20260720110000, 20260720120000)을 실행한 뒤 다시 시도해 주세요.';

export function isMissingInstagramColumnError(message: string): boolean {
  return /instagram|column.*does not exist/i.test(message);
}
