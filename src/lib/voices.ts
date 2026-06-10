// Custom ElevenLabs voices used by Vaibes. All use `eleven_multilingual_v2`
// so they speak any of the supported languages, but pronunciation/accent
// stays close to the voice's native one — so we map sensible defaults below.
export type Voice = {
  id: string;
  name: string;
  gender: 'female' | 'male';
  vibe: string;
};

export const VOICES: Voice[] = [
  { id: '9rvdnhrYoXoUt4igKpBw', name: 'Mariana', gender: 'female', vibe: 'Calm, expressive' },
  { id: '86V9x9hrQds83qf7zaGn', name: 'Marcela', gender: 'female', vibe: 'Colombian Spanish, warm' },
  { id: '8mBRP99B2Ng2QwsJMFQl', name: 'Antonio', gender: 'male',   vibe: 'Grounded, friendly' },
];

// Defaults per language. Spanish goes to Marcela for native Colombian accent.
// Everything else defaults to Mariana.
export const LANGUAGE_DEFAULT_VOICE: Record<string, string> = {
  en: '9rvdnhrYoXoUt4igKpBw', // Mariana
  es: '86V9x9hrQds83qf7zaGn', // Marcela
  fr: '9rvdnhrYoXoUt4igKpBw',
  pt: '9rvdnhrYoXoUt4igKpBw',
  de: '9rvdnhrYoXoUt4igKpBw',
  it: '9rvdnhrYoXoUt4igKpBw',
  ja: '9rvdnhrYoXoUt4igKpBw',
};

export function resolveVoice(
  preferredId: string | null | undefined,
  language: string | null | undefined,
  envFallback: string | null | undefined,
): string {
  if (preferredId && VOICES.some((v) => v.id === preferredId)) return preferredId;
  const lang = (language ?? 'en').toLowerCase();
  return LANGUAGE_DEFAULT_VOICE[lang] ?? envFallback ?? '9rvdnhrYoXoUt4igKpBw';
}
