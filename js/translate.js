// Keyless translation: Google web endpoint first, MyMemory as fallback.
// Returns { text: string, ok: boolean } — same contract as before.

async function viaGoogle(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q='
    + encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('google http ' + res.status);
  const data = await res.json();
  const out = (data[0] || []).map(seg => seg[0]).join('').trim();
  if (!out) throw new Error('google empty');
  return out;
}

async function viaMyMemory(text, srcLang) {
  const src = srcLang && srcLang !== 'auto' ? srcLang : 'te';
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
    + '&langpair=' + encodeURIComponent(src + '|en');
  const res = await fetch(url);
  if (!res.ok) throw new Error('mymemory http ' + res.status);
  const data = await res.json();
  const out = ((data.responseData || {}).translatedText || '').trim();
  if (!out || data.responseStatus !== 200) throw new Error('mymemory bad response');
  return out;
}

export async function translateToEnglish(text, sourceLang) {
  // English input: nothing to translate, keep as typed/spoken.
  if (sourceLang === 'en') return { text, ok: true };
  try {
    return { text: await viaGoogle(text), ok: true };
  } catch (e1) {
    console.warn('Lucky: Google translate failed, trying MyMemory', e1);
    try {
      return { text: await viaMyMemory(text, sourceLang), ok: true };
    } catch (e2) {
      console.error('Lucky: Translation failed', e2);
      return { text, ok: false };
    }
  }
}
