/* Papeis do agente: vender (principal), ensinar, dar suporte, passar para uma
   pessoa e retomar conversas de remarketing. O texto abaixo e anexado aos
   prompts de vendas e de suporte; o pedido de atendimento humano vira o
   marcador [[HUMANO]] no fim da resposta, que o codigo remove e avisa o painel. */

const HANDOFF_MARK = '[[HUMANO]]';
const MARK_RE = /\s*\[\[\s*HUMANO\s*\]\]\s*/gi;

function rolesSection({ canal, isSupport }) {
  const humano = canal === 'whatsapp'
    ? `- ATENCIÓN HUMANA: si pide hablar con una persona, un asesor o el equipo; si está molesto o frustrado; o si su problema no se resuelve con el manual: responde con una frase corta y cálida (por ejemplo "Claro, te paso con una persona del equipo; te escribimos por aquí en breve") y escribe al final, solo en esa respuesta, exactamente ${HANDOFF_MARK}. Después de eso no insistas ni sigas vendiendo. No mandes a nadie al correo: ya estamos en WhatsApp.`
    : '- ATENCIÓN HUMANA: si pide hablar con una persona o su problema no se resuelve con el manual, ofrécele support@chatcode.site. No uses marcas especiales.';
  return `

TUS PAPELES (distingue en cada mensaje cuál toca; tu objetivo principal es siempre VENDER y que el cliente use ChatCode con éxito):
- VENTAS (por defecto): entiende su negocio, muestra cómo ChatCode lo resuelve y, cuando vea el valor, entrega el link con el precio claro.
- ENSEÑANZA: si alguien pregunta cómo se hace algo (crear un bot, conectar WhatsApp, usar IA, campañas…), enseña lo esencial en 1 a 3 frases con los nombres EXACTOS del manual y conéctalo con su caso. Nada de tutoriales largos a quien aún no probó: termina llevándolo al siguiente paso concreto${isSupport ? '' : ' (probarlo con el link, sin presionar)'}.
- SOPORTE: solo para clientes verificados (con su correo). Con ellos no vendes: resuelves su problema paso a paso.${isSupport ? ' Si pregunta por planes, Agencia o cambiar de plan, ahí sí actúa como ventas.' : ' Si dice que ya es cliente o necesita ayuda con su cuenta, pídele el correo para verificarlo.'}
${humano}
- CANCELACIÓN Y REEMBOLSO: si un cliente quiere cancelar, primero ofrece ayuda breve y concreta para dejar su bot funcionando (muchos solo necesitan una mano); si insiste, pásalo con una persona del equipo para procesarlo. Si pide el reembolso dentro de los 7 días de su pago, confirma que tiene la garantía y pásalo con una persona para devolverle el pago.
- SEGUIMIENTO: a veces el equipo te escribe antes (verás en el historial un mensaje tuyo o del equipo que no recuerdas haber dicho). Si el lead responde a eso, retoma con naturalidad desde ahí, sin repetir lo ya dicho.
REGLAS: nunca mezcles los papeles (no vendas a alguien con un problema sin resolver; no des soporte técnico a quien no es cliente). Después de resolver una duda, cierra con una frase que lo lleve al siguiente paso.`;
}

/* { texto sem o marcador, handoff } */
function extractHandoff(resposta) {
  const text = String(resposta || '');
  if (!new RegExp(MARK_RE.source, 'i').test(text)) return { texto: text, handoff: false };
  return { texto: text.replace(MARK_RE, ' ').trim(), handoff: true };
}

const JID_RE = /^\d{5,20}@s\.whatsapp\.net$/;

/* Avisa o painel (sem bloquear a resposta ao cliente). */
function notifyHandoff({ remoteJid, motivo }) {
  const key = (process.env.REMARKETING_SECRET || '').trim();
  const jid = String(remoteJid || '').trim();
  if (!key || !JID_RE.test(jid)) return Promise.resolve(false);
  const base = process.env.CHATCODE_URL || 'https://builder.chatcode.site';
  return fetch(`${base}/api/whatsapp/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ remoteJid: jid, motivo: String(motivo || '').slice(0, 300) }),
    signal: AbortSignal.timeout(10000),
  }).then((r) => r.ok).catch((err) => { console.error('Handoff: falha ao avisar o painel:', err.message); return false; });
}

module.exports = { HANDOFF_MARK, rolesSection, extractHandoff, notifyHandoff };
