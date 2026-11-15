/* Lista de espera da Black Friday pelo WhatsApp (24/11 a 26/11, antes de a oferta abrir).
   Quem escreve sobre Black Friday recebe uma resposta FIXA (sem pergunta no fim, sem
   puxar conversa) e o telefone vai para a lista do painel. Na abertura (27/11) o painel
   avisa essas pessoas por WhatsApp. Janela igual a do painel (UTC-5). */
const PRE_START = Date.parse('2026-11-24T05:00:00Z');
const OPEN = Date.parse('2026-11-27T05:00:00Z');
const preOpen = (now = Date.now()) => now >= PRE_START && now < OPEN;

const ASKS_BF = /black\s*-?\s*friday|viernes\s+negro/i;

const REPLY_FIRST =
  '¡Listo! Te anoto en la lista. El 27 de noviembre abrimos la oferta anual de Black Friday: ChatCode Ilimitado por US$149 al año (en vez de US$228), con garantía de reembolso de 7 días. Te escribo por aquí apenas abra.';
const REPLY_AGAIN = 'Ya estás en la lista. Te escribo por aquí apenas abra la oferta, el 27 de noviembre.';

/* Devolve a resposta fixa se a mensagem e sobre Black Friday dentro da janela; senao null. */
function waitlistReply(texto, historico, now = Date.now()) {
  if (!preOpen(now) || !ASKS_BF.test(String(texto || ''))) return null;
  const jaRespondeu = (historico || []).some((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('¡Listo! Te anoto en la lista'));
  return jaRespondeu ? REPLY_AGAIN : REPLY_FIRST;
}

/* Registra o telefone na lista do painel (nunca quebra a conversa se falhar). */
async function registerPhone(remoteJid, fetchImpl = fetch) {
  const key = (process.env.REMARKETING_SECRET || '').trim();
  const phone = String(remoteJid || '').split('@')[0].replace(/\D/g, '');
  if (!key || phone.length < 8) return false;
  const base = process.env.BUILDER_URL || 'https://builder.chatcode.site';
  try {
    const r = await fetchImpl(`${base}/api/blackfriday/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch (e) {
    console.error('blackfriday: falha ao registrar na lista:', e.message);
    return false;
  }
}

module.exports = { waitlistReply, registerPhone, preOpen };
