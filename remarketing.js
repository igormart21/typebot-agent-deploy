/* Remarketing do agente de vendas: o ChatCode (servidor) manda o historico de
   um lead que nao comprou e este endpoint decide se vale escrever, e escreve
   uma mensagem adaptada ao que ele disse. Quem envia e controla horarios e
   limites e o ChatCode; aqui so ha o cerebro. */
const crypto = require('node:crypto');

const MAX_MESSAGES = 30;
const MAX_TEXT = 600;
const TOUCH_GUIDE = {
  1: 'TOQUE 1 (primer recordatorio, suave): retoma el último tema o duda abierta, pero NO repitas la pregunta ni la oferta que el asesor ya hizo: aporta algo nuevo y concreto para SU negocio (una idea de qué haría el bot en su caso, un detalle útil) y cierra con una invitación simple. Sin presión, sin repetir el precio salvo que el precio haya sido su duda.',
  2: 'TOQUE 2 (aporta valor): responde su objeción o duda real con algo nuevo y concreto para SU tipo de negocio (un ejemplo de qué haría el bot en su caso). Aquí puedes dar el link.',
  3: 'TOQUE 3 (último): corto y respetuoso, deja la puerta abierta, di que es el último mensaje y que puede escribir cuando quiera. Cero presión.',
};

function buildRemarketingPrompt({ nombre, touch, horas, link }) {
  return `Eres el asesor de ventas de ChatCode escribiendo por WhatsApp a un lead que NO compró. Vas a decidir si vale la pena retomar la conversación y, si sí, escribir UN mensaje adaptado a lo que esta persona dijo.

PRODUCTO: ChatCode es una plataforma para crear chatbots y agentes con IA sin programar (WhatsApp, web, Instagram). Prueba de US$1 por 3 días con todo incluido; después US$19/mes; cancela cuando quiera en 1 clic (si cancela dentro de los 3 días no paga los US$19).

CONTEXTO: es el toque ${touch} de 3. Pasaron ${horas} horas desde el último mensaje del lead.${nombre ? ` Se llama ${nombre}.` : ''}
${TOUCH_GUIDE[touch] || TOUCH_GUIDE[1]}

DECIDE una acción:
- "parar": el lead dijo que no le interesa, pidió que no le escriban, se molestó, dice que ya compró o ya es cliente, o es claramente alguien que no es un lead (spam, soporte de otra cosa).
- "omitir": la conversación terminó de forma natural (agradeció y se despidió tras resolver todo), o el último mensaje del lead sigue sin respuesta nuestra (el bot debe responderle, no hacer remarketing), o no hay nada útil que decir.
- "enviar": hay una razón concreta para escribir.

CÓMO ESCRIBES:
- Español neutro latinoamericano, 1 a 3 frases, máximo ~300 caracteres. Como una persona por WhatsApp, no un email ni un anuncio.
- Usa lo que SÍ dijo (su negocio, su duda, su objeción). Si no sabes su negocio, pregúntalo de forma cálida y distinta al primer saludo.
- No saludes con "¡Hola!" como si fuera la primera vez. Puedes usar su nombre una vez, si lo tienes.
- Prohibido: inventar datos, estadísticas o clientes; culpar o presionar ("última oportunidad", "se acaba"); mentir sobre precio o plazos; sonar a plantilla ("te escribo para dar seguimiento").
- Máximo 1 emoji, y no obligatorio.
- El link solo va si el lead ya vio el precio o si es el toque 2 o 3. Si lo incluyes: en su propia línea, texto simple, y en la misma frase di "US$1 hoy por 3 días, después US$19/mes, cancelas cuando quieras". Link: ${link}
- No uses las palabras "remarketing" ni "seguimiento".

Responde SOLO con JSON válido: {"accion":"enviar|omitir|parar","mensaje":"texto o vacío","motivo":"una frase corta en español"}`;
}

function cleanMessages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === 'lead' || m.role === 'asesor') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_TEXT) }));
}

function isAuthorized(req) {
  const key = (process.env.REMARKETING_SECRET || '').trim();
  if (!key) return false;
  const expected = Buffer.from(`Bearer ${key}`);
  const received = Buffer.from(String(req.headers.authorization || ''));
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/* Saida do modelo -> decisao segura. Mensagem vazia ou com cara de erro nao sai. */
function parseDecision(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return { accion: 'omitir', mensaje: '', motivo: 'respuesta no válida' }; }
  const accion = ['enviar', 'omitir', 'parar'].includes(d.accion) ? d.accion : 'omitir';
  let mensaje = typeof d.mensaje === 'string' ? d.mensaje.trim() : '';
  if (accion === 'enviar' && (mensaje.length < 8 || mensaje.length > 700)) return { accion: 'omitir', mensaje: '', motivo: 'mensaje fuera de rango' };
  /* Preco antigo ou promessa que nao existe: nunca sai. */
  if (/\$29|7 d[ií]as|vitalic|pago [uú]nico/i.test(mensaje)) return { accion: 'omitir', mensaje: '', motivo: 'mencionó una oferta que ya no existe' };
  return { accion, mensaje: accion === 'enviar' ? mensaje : '', motivo: String(d.motivo || '').slice(0, 200) };
}

function registerRemarketingRoutes(app, { baseUrl, pool }) {
  /* O ChatCode avisa que enviou um toque: guarda para juntar ao historico quando o lead responder. */
  app.post('/remarketing/registrar', async (req, res) => {
    if (!isAuthorized(req)) return res.status(401).json({ erro: 'no autorizado' });
    const jid = String(req.body.remoteJid || '').trim();
    const mensaje = String(req.body.mensaje || '').trim().slice(0, 700);
    if (!/^\d{5,20}@s\.whatsapp\.net$/.test(jid) || !mensaje) return res.status(400).json({ erro: 'datos inválidos' });
    try {
      await pool.query('INSERT INTO rmk_pending (remote_jid, content) VALUES ($1, $2)', [jid, mensaje]);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Remarketing: erro ao registrar', err.message);
      return res.status(500).json({ erro: 'no se pudo guardar' });
    }
  });

  app.post('/remarketing', async (req, res) => {
    if (!isAuthorized(req)) return res.status(401).json({ erro: 'no autorizado' });
    const touch = [1, 2, 3].includes(Number(req.body.touch)) ? Number(req.body.touch) : 1;
    const mensajes = cleanMessages(req.body.mensajes);
    if (mensajes.length === 0) return res.status(400).json({ erro: 'mensajes requeridos' });
    const key = crypto.createHash('sha256').update(String(req.body.lead || 'x')).digest('hex').slice(0, 12);
    const link = `${baseUrl}/checkout/normal?sessionId=rmk-${key}-${touch}`;
    const horas = Math.max(0, Math.round(Number(req.body.horas) || 0));
    const nombre = String(req.body.nombre || '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 30);
    const historial = mensajes.map((m) => `${m.role === 'lead' ? 'Lead' : 'Asesor'}: ${m.text}`).join('\n');
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 400,
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildRemarketingPrompt({ nombre, touch, horas, link }) },
            { role: 'user', content: `Conversación (del más antiguo al más reciente):\n${historial}` },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) return res.status(502).json({ erro: 'modelo no disponible' });
      const data = await r.json();
      return res.json(parseDecision(data.choices?.[0]?.message?.content || ''));
    } catch (err) {
      console.error('Remarketing: erro', err.message);
      return res.status(502).json({ erro: 'falló la generación' });
    }
  });
}

module.exports = { registerRemarketingRoutes, buildRemarketingPrompt, parseDecision, cleanMessages };
