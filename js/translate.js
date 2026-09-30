// API key injected at deploy time via window.LUCKY_API_KEY
const API_KEY = window.LUCKY_API_KEY || '';
if (!API_KEY || API_KEY === '%%LUCKY_API_KEY%%') {
  console.warn('Lucky: No Anthropic API key set — translation will fail. Set LUCKY_API_KEY in Render env vars.');
}

// Translates Telugu/Hindi/Tenglish → English AND fixes grammar in one call.
// Returns { text: string, ok: boolean }
export async function translateToEnglish(text, sourceLang) {
  try {
    const langHint = sourceLang && sourceLang !== 'auto'
      ? `The input is in ${sourceLang} (could be Telugu, Hindi, Tenglish/mixed, or English).`
      : 'The input may be Telugu, Hindi, Tenglish (Telugu+English mixed), or English.';

    const prompt = `You are a translation and grammar assistant.
${langHint}
Translate the following text into clear, natural English.
If it is already in English, just fix any grammar or spelling errors.
Reply with ONLY the translated/corrected English text — no explanations, no quotes, no extra lines.

Input: ${text}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) throw new Error('API HTTP ' + res.status);

    const data = await res.json();
    const out = (data.content || []).find(b => b.type === 'text');
    const translated = out ? out.text.trim() : text;
    return { text: translated || text, ok: true };

  } catch (e) {
    console.error('Lucky: Translation failed', e);
    return { text, ok: false };
  }
}
