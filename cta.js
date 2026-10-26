/* Botao/cartao de chamada no WhatsApp em vez de link cru.
   O texto da resposta sai sem o link e, logo depois, o agente manda o botao
   pela Evolution. Se o envio do botao falhar, o link vai como texto simples:
   o lead nunca fica sem ele. CTA_MODE: off (padrao) | card | button | image. */
const CHECKOUT_RE = /https?:\/\/[^\s]+\/checkout\/(?:normal|discount|revenda)\?[^\s]+/gi;
const JID_RE = /^\d{5,20}@s\.whatsapp\.net$/;
const TITLE = 'Activa ChatCode con garantía de 7 días 👇';
const LABEL = 'Activar ChatCode';
const DETAIL = 'US$19/mes con garantía de reembolso de 7 días. Cancelas cuando quieras.';

const mode = () => {
  const m = String(process.env.CTA_MODE || 'off').toLowerCase();
  return ['card', 'button', 'image'].includes(m) ? m : 'off';
};

/* Tira o link cru do texto e devolve o link da pagina de preview (/p/). */
function splitCta(resposta, baseUrl) {
  const text = String(resposta || '');
  const found = text.match(CHECKOUT_RE) || [];
  if (found.length === 0) return { texto: text, url: null };
  const url = found[0].replace(/^https?:\/\/[^\s/]+\/checkout\//i, `${baseUrl}/p/`).replace(/[.,;:!?)]+$/, '');
  const texto = text
    .replace(CHECKOUT_RE, '')
    .replace(/:\s*$/gm, '.')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { texto, url };
}

async function evo(path, body) {
  const base = process.env.EVOLUTION_API_URL, key = process.env.EVOLUTION_API_KEY;
  if (!base || !key) throw new Error('Evolution sem configurar');
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Evolution ${r.status}`);
  return r.json().catch(() => ({}));
}

/* Envia o botao; se falhar, manda o link como texto. Nunca lanca. */
async function sendCta({ instancia, remoteJid, url, baseUrl }) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(instancia || '')) || !JID_RE.test(String(remoteJid || ''))) return false;
  const number = remoteJid.split('@')[0];
  const m = mode();
  try {
    if (m === 'button')
      await evo(`/message/sendButtons/${instancia}`, {
        number, title: 'ChatCode', description: DETAIL, footer: 'ChatCode',
        buttons: [{ type: 'url', displayText: LABEL, url }],
      });
    else if (m === 'image')
      await evo(`/message/sendMedia/${instancia}`, {
        number, mediatype: 'image', mimetype: 'image/png', fileName: 'chatcode.png',
        media: `${baseUrl}/assets/og-activar.png`, caption: `${TITLE}\n${url}`,
      });
    else
      await evo(`/message/sendText/${instancia}`, { number, text: `${TITLE}\n${url}`, linkPreview: true });
    return true;
  } catch (err) {
    console.error('CTA: falhou o envio, mandando o link simples:', err.message);
    try {
      await evo(`/message/sendText/${instancia}`, { number, text: url });
      return true;
    } catch (err2) {
      console.error('CTA: tambem falhou o link simples:', err2.message);
      return false;
    }
  }
}

const PROMPT_NOTE = `

BOTÓN DE INICIO: cuando entregues el link, preséntalo con una frase como "Te dejo el botón para empezar 👇" (no escribas "aquí está el link:"). El sistema convierte tu link en un botón que llega justo después de tu mensaje; sigue incluyendo el link y el precio con la garantía de 7 días en tu texto como siempre.`;

module.exports = { mode, splitCta, sendCta, PROMPT_NOTE, LABEL };
