/* Resposta por nota de voz: so quando o lead mandou audio (WhatsApp) e a resposta e curta e
   sem link. Desligada por padrao: AGENT_VOICE=on e ELEVENLABS_API_KEY na Railway.
   Se qualquer passo falhar, devolve false e o agente responde por texto como sempre. */
const MAX_SPOKEN = 500;
const JID_RE = /^\d{5,20}@s\.whatsapp\.net$/;
const VOICE_DEFAULT = 'JYyJjNPfmNJdaby8LdZs'; // Marlene (mesma voz padrao dos superagentes)

const enabled = () => /^(1|true|on)$/i.test(String(process.env.AGENT_VOICE || '')) && !!process.env.ELEVENLABS_API_KEY;
const leadSpoke = (texto) => /^\[audio\]/i.test(String(texto || '').trim());
const speakable = (t) => !!t && t.length <= MAX_SPOKEN && !/https?:\/\/|^\s*[-*•]\s|\/checkout\//m.test(t);

async function speak(text) {
  const voice = process.env.AGENT_VOICE_ID || VOICE_DEFAULT;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5' }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* true = a nota de voz foi enviada (o chamador nao manda o texto); nunca lanca. */
async function replyWithVoice({ instancia, remoteJid, texto, leadTexto }) {
  if (!enabled() || !leadSpoke(leadTexto) || !speakable(texto)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(String(instancia || '')) || !JID_RE.test(String(remoteJid || ''))) return false;
  const base = process.env.EVOLUTION_API_URL, key = process.env.EVOLUTION_API_KEY;
  if (!base || !key) return false;
  try {
    const audio = await speak(texto);
    const r = await fetch(`${base}/message/sendWhatsAppAudio/${instancia}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid.split('@')[0], audio: audio.toString('base64'), encoding: true }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Evolution ${r.status}`);
    return true;
  } catch (err) {
    console.error('Voz: falhou, responde por texto:', err.message);
    return false;
  }
}

module.exports = { enabled, leadSpoke, speakable, replyWithVoice };
