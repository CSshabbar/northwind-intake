export type TranscriptRole = "avery" | "you";

export type TranscriptLine = { role: TranscriptRole; text: string };

export function normalizeSpeech(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeEcho(userText: string, averyText: string) {
  const user = normalizeSpeech(userText);
  const avery = normalizeSpeech(averyText);
  if (!user || !avery) return false;
  if (user.length >= 10 && avery.includes(user)) return true;
  if (avery.length >= 10 && user.includes(avery)) return true;
  const averyWords = avery.split(" ").filter((word) => word.length > 3);
  if (averyWords.length < 4) return false;
  const userWords = new Set(user.split(" "));
  const overlap = averyWords.filter((word) => userWords.has(word)).length;
  return overlap / averyWords.length >= 0.6;
}

export function mergeTranscript(
  current: TranscriptLine[],
  role: TranscriptRole,
  text: string,
): TranscriptLine[] {
  const last = current.at(-1);
  if (!last || last.role !== role) return [...current, { role, text }];
  if (text.startsWith(last.text) || last.text.startsWith(text)) {
    return [...current.slice(0, -1), { role, text: text.length >= last.text.length ? text : last.text }];
  }
  return [...current, { role, text }];
}
