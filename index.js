const express = require('express');
const { Pool } = require('pg');
const app = express();
app.use(express.json());

// ============================================================
// BANCO DE DADOS - Supabase PostgreSQL
// ============================================================
const pool = new Pool({
  host: (process.env.DB_HOST || '').trim(),
  port: parseInt((process.env.DB_PORT || '6543').trim()),
  user: (process.env.DB_USER || '').trim(),
  password: (process.env.DB_PASSWORD || '').trim(),
  database: (process.env.DB_NAME || 'postgres').trim(),
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = process.env.BASE_URL || 'https://typebot-agent-deploy-production.up.railway.app';
// Assinatura na Stripe: US$1 por 7 dias, depois US$19/mes.
/* Lead cria a conta no painel; ao entrar ja ve o cartao do plano ($1 + 7 dias)
   e o checkout da Stripe sai ligado ao workspace dele. */
const SIGNUP_URL = process.env.SIGNUP_URL || 'https://builder.chatcode.site/register';
/* Demo do bot no WhatsApp (numero da ChatCode). */
const WHATSAPP_URL = process.env.WHATSAPP_URL || 'https://wa.me/5531993917883?text=' + encodeURIComponent('Quiero más información sobre ChatCode.');
const MAX_HISTORY = 40;

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_message_at TIMESTAMPTZ DEFAULT NOW(),
      converted BOOLEAN DEFAULT FALSE,
      message_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS link_clicks (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      link_type TEXT,
      clicked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Banco de dados inicializado');
}

// ============================================================
// FUNÇÕES DE BANCO
// ============================================================
async function getHistory(sessionId) {
  /* As MAIS RECENTES. Antes era ASC + LIMIT: pegava as 40 primeiras da
     conversa pra sempre, e uma conversa longa nunca via o que acabou de
     ser dito. */
  const result = await pool.query(
    'SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2',
    [sessionId, MAX_HISTORY]
  );
  return result.rows.reverse();
}

async function saveMessage(sessionId, role, content) {
  await pool.query(
    'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
    [sessionId, role, content]
  );
  await pool.query(`
    INSERT INTO sessions (id, last_message_at, message_count)
    VALUES ($1, NOW(), 1)
    ON CONFLICT (id) DO UPDATE
    SET last_message_at = NOW(), message_count = sessions.message_count + 1
  `, [sessionId]);
}

async function getInsights() {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sessions) as total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE converted = true) as total_conversions,
        (SELECT ROUND(AVG(message_count), 1) FROM sessions WHERE converted = true) as avg_msgs_converted,
        (SELECT ROUND(AVG(message_count), 1) FROM sessions WHERE converted = false AND message_count > 2) as avg_msgs_abandoned,
        (SELECT COUNT(*) FROM link_clicks WHERE link_type = 'normal') as clicks_normal,
        (SELECT COUNT(*) FROM link_clicks WHERE link_type = 'discount') as clicks_discount
    `);
    return result.rows[0];
  } catch {
    return null;
  }
}

// ============================================================
// SYSTEM PROMPT com links de rastreamento dinâmicos
// ============================================================
function buildSystemPrompt(sessionId, insights, canal) {
  const linkNormal = `${BASE_URL}/checkout/normal?sessionId=${sessionId}`;
  const linkRevenda = `${BASE_URL}/checkout/revenda?sessionId=${sessionId}`;
  /* No WhatsApp link em markdown aparece quebrado: vai o endereco puro. */
  const noWhatsApp = canal === 'whatsapp';
  const link = (texto, url) => (noWhatsApp ? url : `[${texto}](${url})`);

  let prompt = `Eres el asesor de ventas de ChatCode. Conversas como una persona real por chat: cercana, segura y con buen criterio comercial. Tu objetivo es que el lead pruebe ChatCode, pero vendes entendiendo su negocio, no recitando el producto.

CANAL: ${noWhatsApp ? 'WhatsApp. El lead YA está hablando contigo por WhatsApp: nunca ofrezcas "probar en WhatsApp" ni una demo por WhatsApp, esta conversación es la demo. Los links van como texto simple, en su propia línea.' : 'Chat web. Los links van como botón en formato [texto](url).'}

CÓMO ESCRIBES (lo más importante):
- Mensajes CORTOS: 1 a 3 frases, máximo ~300 caracteres. Como un mensaje de WhatsApp, no un email.
- Nada de listas, viñetas ni párrafos largos. Máximo 1 emoji, y no en todos los mensajes.
- Nunca saludes de nuevo en medio de la conversación ("¡Hola!" solo al inicio).
- Lee el historial antes de responder. NUNCA repitas algo que ya dijiste (precio, beneficios, que funciona en la nube, que no necesita programar...). Si ya lo dijiste, avanza.
- Responde exactamente lo que preguntó, con sus palabras y su caso. Si te cuenta su negocio, usa ese ejemplo concreto.
- No termines siempre con pregunta. Haz una pregunta solo cuando te ayude a entender su negocio o a avanzar. Varía.
- Si responde "sí", "dale", "quiero", "me interesa" a algo que ofreciste, haz exactamente eso, sin rodeos.
- Español neutro latinoamericano.

PRODUCTO (ChatCode Ilimitado, suscripción):
- Plataforma en la nube para crear chatbots y agentes con IA, sin programar, desde PC o celular. Funciona 24/7 sin PC encendida.
- Prueba: US$1 por 7 días con todo incluido. Después US$19 al mes. Cancela cuando quiera en 1 clic; si cancela dentro de los 7 días no paga los US$19.
- Un solo plan. Bots ilimitados.
- Cómo empezar: crea su cuenta solo con su email en el link y, al entrar, activa la prueba de US$1 con tarjeta (pago seguro con Stripe).
- Link para empezar: ${link('Probar 7 días por US$1', linkNormal)}
- Página oficial: ${link('Ver ChatCode', 'https://chatcode.site')}
- ChatCode es el nuevo nombre de Typebot Ilimitado (si mencionan Typebot).

QUÉ HACE (solo esto, no inventes otras funciones):
- WhatsApp conectado con código QR, sin API oficial de Meta (también con WhatsApp Business). Varios números por bot.
- Bots para la web (link propio o insertado en su sitio).
- Agentes con IA (OpenAI, Claude y otros) que conversan como tú lo estás haciendo ahora.
- "Crear con IA": el cliente describe su negocio y la IA arma el bot en segundos.
- El bot envía textos, imágenes, videos, audios y PDFs; hace preguntas, guarda los datos del cliente, agenda, envía links de pago (Mercado Pago, Stripe, Hotmart, etc.) y entrega links de productos digitales.
- Integraciones: Google Sheets, Zapier, Make, webhooks, Gmail.
- Dominio propio y sin marca de ChatCode.

NO PROMETAS (no existe hoy): Instagram, Facebook Messenger, envíos masivos, entender los audios que manda el cliente, seguimiento automático de pagos pendientes, tutoriales o cursos incluidos, emails de aviso antes del cobro. Si preguntan por algo de esto, dilo con honestidad y ofrece la alternativa que sí existe.

PRECIO, CON TRANSPARENCIA:
- La primera vez que entregues el link di: "US$1 hoy por 7 días, después US$19/mes, cancelas cuando quieras". Después no lo repitas en cada mensaje.
- Nunca digas pago único, vitalicio, para siempre ni sin mensualidades. No existen descuentos.
${noWhatsApp ? '' : `
DEMO EN WHATSAPP (solo en el chat web):
- Si el lead pide probar o hablar por WhatsApp, ver un bot en WhatsApp o pide un número: entrega ${link('Probar en WhatsApp', WHATSAPP_URL)} y dile que ahí verá un bot de ChatCode respondiendo en tiempo real. Nunca escribas el número suelto.
`}
VENDER COMO HUMANO:
- Primero entiende: qué vende, por dónde le escriben sus clientes, qué le quita tiempo. Una pregunta a la vez.
- Después conecta: muestra cómo ChatCode resuelve SU caso, en una frase concreta.
- Cuando vea el valor o pregunte cómo empezar: entrega el link sin más preámbulo.
- Objeciones: responde corto y honesto. Precio → prueba todo por US$1 y decide en 7 días; similares cuestan más de US$80/mes. "Lo pienso" → pregunta qué duda tiene. Seguridad → pago con Stripe.
- Si pregunta qué eres: eres un agente de IA hecho con ChatCode, exactamente lo que él puede crear para su negocio.

REVENTA (solo si pregunta): puede vender bots a sus clientes; para revender la plataforma con su marca hay un plan de US$99: ${link('Quiero ser revendedor', linkRevenda)}`;

  // Injeta insights reais de conversão no prompt
  if (insights && parseInt(insights.total_sessions) > 10) {
    const taxa = ((parseInt(insights.total_conversions) / parseInt(insights.total_sessions)) * 100).toFixed(1);
    const avgConvertido = insights.avg_msgs_converted || 0;
    const avgAbandonado = insights.avg_msgs_abandoned || 0;

    prompt += `

INTELIGÊNCIA DE CONVERSÃO (dados reais das suas conversas):
- Taxa de conversão atual: ${taxa}%
- Leads que compram respondem em média ${avgConvertido} mensagens
- Leads que abandonam ficam em média ${avgAbandonado} mensagens sem converter
- Se o lead ultrapassar ${Math.round(parseFloat(avgAbandonado) * 0.8)} mensagens sem avançar, mude de abordagem: reforce que prueba todo por $1
Use esses dados para fechar mais vendas. Adapte sua abordagem ao que está funcionando.`;
  }

  return prompt;
}

// ============================================================
// ROTA PRINCIPAL - Webhook do Typebot
// ============================================================
app.post('/agente', async (req, res) => {
  console.log('Incoming request to /agente:', JSON.stringify(req.body));
  try {
    const { mensagem } = req.body;
    const sessionId = String(req.body.sessionId || req.body.session_id || req.body.resultId || '').trim();

    if (!mensagem) {
      return res.status(400).json({ erro: 'mensagem é obrigatória' });
    }

    /* Sem sessionId o bot nao disse de quem e a conversa. Antes isso caia
       num 'preview-session' unico, e TODOS os visitantes dividiam o mesmo
       historico (1.000 mensagens desde marco, com a oferta antiga). Agora a
       mensagem e respondida sozinha, sem historico de ninguem. */
    const temId = sessionId && !/^\{\{.*\}\}$/.test(sessionId);
    if (!temId) console.warn('⚠️  /agente sem sessionId: respondendo sem historico. Configure {{resultId}} no Typebot.');
    const id = temId ? sessionId : 'sem-session-id';

    // Busca histórico do banco
    const historico = temId ? await getHistory(id) : [];

    // Salva mensagem do usuário
    await saveMessage(id, 'user', mensagem);
    historico.push({ role: 'user', content: mensagem });

    // Busca insights para enriquecer o prompt
    const insights = await getInsights();
    const canal = String(req.body.canal || '').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'web';
    const systemPrompt = buildSystemPrompt(id, insights, canal);

    // Chama a API da OpenAI com todo o histórico e timeout de 20s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 350,
          temperature: 0.8,
          messages: [
            { role: 'system', content: systemPrompt },
            ...historico
          ]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const erro = await response.text();
      console.error('Erro OpenAI API:', erro);
      return res.status(500).json({ erro: 'Erro ao chamar OpenAI API', detalhe: erro });
    }

    const data = await response.json();
    let resposta = data.choices?.[0]?.message?.content;

    /* Trava: a oferta antiga (pagamento unico/vitalicio/US$29) nao pode
       sair. Se sair, refaz uma vez com a correcao explicita. */
    const OFERTA_ANTIGA = /vital[ií]ci|pago [úu]nico|\$\s?29\b|29 ?usd/i;
    if (resposta && OFERTA_ANTIGA.test(resposta)) {
      console.warn('⚠️  resposta com a oferta antiga, refazendo');
      try {
        const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 350,
            messages: [
              { role: 'system', content: systemPrompt },
              ...historico,
              { role: 'system', content: 'CORRECCIÓN: tu respuesta mencionó pago único, acceso vitalicio o $29, que ya NO existen. Reescríbela: el precio es $1 por 7 días de prueba, después $19 al mes, cancelas cuando quieras.' }
            ]
          }),
          signal: AbortSignal.timeout(20000)
        });
        const d2 = r2.ok ? await r2.json() : null;
        const nova = d2?.choices?.[0]?.message?.content;
        if (nova && !OFERTA_ANTIGA.test(nova)) resposta = nova;
      } catch (e) { console.error('Erro ao refazer resposta:', e.message); }
    }

    if (!resposta) {
      return res.status(500).json({ erro: 'Resposta vazia' });
    }

    // Salva resposta no banco
    await saveMessage(id, 'assistant', resposta);

    // Detecta se o agente enviou link de checkout (sinal de conversão)
    if (resposta.includes('/checkout/')) {
      await pool.query(
        'UPDATE sessions SET converted = true WHERE id = $1',
        [id]
      );
    }

    res.json({ resposta });

  } catch (err) {
    console.error('Erro no processamento da mensagem:', err);
    res.status(500).json({
      erro: 'Erro interno no Agente v2',
      mensagem: err.message,
      detalhe: err.name === 'AbortError' ? 'Timeout da API OpenAI (20s)' : err.stack
    });
  }
});

// ============================================================
// RASTREAMENTO DE CLIQUES NO CHECKOUT
// ============================================================
app.get('/checkout/:tipo', async (req, res) => {
  const { tipo } = req.params;
  const { sessionId } = req.query;

  /* normal e discount (links antigos no historico das conversas) vao pro
     cadastro no painel; a assinatura e feita la dentro. */
  const links = {
    normal: SIGNUP_URL,
    discount: SIGNUP_URL,
    revenda: 'https://pay.hotmart.com/P103601719F?checkoutMode=10&bid=1767150906305'
  };

  try {
    await pool.query(
      'INSERT INTO link_clicks (session_id, link_type) VALUES ($1, $2)',
      [sessionId || 'unknown', tipo]
    );
    if (sessionId) {
      await pool.query(
        'UPDATE sessions SET converted = true WHERE id = $1',
        [sessionId]
      );
    }
  } catch (err) {
    console.error('Erro ao registrar clique:', err);
  }

  /* O tb.js (rastreamento do bot) poe o sid do anuncio em
     client_reference_id: vai pro painel como tb_sid, que o leva ate a
     Stripe e o Purchase da Meta. */
  const destino = new URL(links[tipo] || links.normal);
  const sid = String(req.query.client_reference_id || '');
  if (destino.hostname === 'builder.chatcode.site' && /^[0-9a-f-]{36}$/i.test(sid)) {
    destino.searchParams.set('tb_sid', sid);
  }
  res.redirect(destino.toString());
});

// ============================================================
// ANALYTICS JSON
// ============================================================
app.get('/analytics', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_sessoes,
        SUM(CASE WHEN converted THEN 1 ELSE 0 END) as conversoes,
        ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as taxa_conversao,
        ROUND(AVG(message_count), 1) as media_mensagens,
        SUM(CASE WHEN last_message_at < NOW() - INTERVAL '2 hours' AND converted = false THEN 1 ELSE 0 END) as abandonos
      FROM sessions
    `);
    const clicks = await pool.query(`SELECT link_type, COUNT(*) as total FROM link_clicks GROUP BY link_type ORDER BY total DESC`);
    const ultimas = await pool.query(`SELECT id, message_count, converted, last_message_at FROM sessions ORDER BY last_message_at DESC LIMIT 20`);
    res.json({ resumo: stats.rows[0], cliques_checkout: clicks.rows, ultimas_sessoes: ultimas.rows });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ============================================================
// DASHBOARD VISUAL
// ============================================================
app.get('/dashboard', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_sessoes,
        SUM(CASE WHEN converted THEN 1 ELSE 0 END) as conversoes,
        ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as taxa_conversao,
        ROUND(AVG(message_count), 1) as media_mensagens,
        SUM(CASE WHEN last_message_at < NOW() - INTERVAL '2 hours' AND converted = false THEN 1 ELSE 0 END) as abandonos
      FROM sessions
    `);
    const clicks = await pool.query(`SELECT link_type, COUNT(*) as total FROM link_clicks GROUP BY link_type ORDER BY total DESC`);
    const ultimas = await pool.query(`SELECT id, message_count, converted, last_message_at FROM sessions ORDER BY last_message_at DESC LIMIT 20`);
    const objections = await pool.query(`
      SELECT content, COUNT(*) as freq
      FROM messages
      WHERE role = 'user' AND (
        content ILIKE '%precio%' OR content ILIKE '%caro%' OR content ILIKE '%descuento%' OR
        content ILIKE '%seguro%' OR content ILIKE '%confio%' OR content ILIKE '%programar%' OR
        content ILIKE '%difícil%' OR content ILIKE '%tiempo%' OR content ILIKE '%no tengo%'
      )
      GROUP BY content ORDER BY freq DESC LIMIT 5
    `);

    const d = stats.rows[0];
    const totalClicks = clicks.rows.reduce((a, r) => a + parseInt(r.total), 0);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Dashboard — Agente de Vendas</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; }
  .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px 32px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header span { font-size: 13px; opacity: 0.8; }
  .refresh { background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .container { padding: 32px; max-width: 1200px; margin: 0 auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .card { background: #1e1e2e; border-radius: 16px; padding: 24px; border: 1px solid #2d2d3d; }
  .card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .card .value { font-size: 36px; font-weight: 800; }
  .card .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .green { color: #10b981; }
  .blue { color: #6366f1; }
  .yellow { color: #f59e0b; }
  .red { color: #ef4444; }
  .purple { color: #a78bfa; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
  @media(max-width:768px){ .grid2 { grid-template-columns: 1fr; } }
  .panel { background: #1e1e2e; border-radius: 16px; padding: 24px; border: 1px solid #2d2d3d; }
  .panel h2 { font-size: 15px; font-weight: 600; margin-bottom: 20px; color: #a78bfa; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #64748b; font-weight: 500; padding: 8px 12px; border-bottom: 1px solid #2d2d3d; }
  td { padding: 10px 12px; border-bottom: 1px solid #1a1a2e; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #064e3b; color: #10b981; }
  .badge-red { background: #450a0a; color: #ef4444; }
  .bar-wrap { margin-bottom: 12px; }
  .bar-label { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .bar-bg { background: #2d2d3d; border-radius: 8px; height: 10px; }
  .bar-fill { height: 10px; border-radius: 8px; background: linear-gradient(90deg, #6366f1, #a78bfa); }
  .objection { background: #16213e; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; font-size: 13px; color: #94a3b8; border-left: 3px solid #6366f1; }
  .tip { background: #1a2744; border-radius: 10px; padding: 16px; margin-bottom: 12px; font-size: 13px; border-left: 4px solid #10b981; }
  .tip strong { color: #10b981; display: block; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>🤖 Agente de Vendas — Dashboard</h1>
    <span>ChatCode Ilimitado · Atualizado agora</span>
  </div>
  <button class="refresh" onclick="location.reload()">↻ Atualizar</button>
</div>
<div class="container">

  <div class="cards">
    <div class="card">
      <div class="label">Total de Sessões</div>
      <div class="value blue">${d.total_sessoes}</div>
      <div class="sub">conversas iniciadas</div>
    </div>
    <div class="card">
      <div class="label">Conversões</div>
      <div class="value green">${d.conversoes}</div>
      <div class="sub">links de compra enviados</div>
    </div>
    <div class="card">
      <div class="label">Taxa de Conversão</div>
      <div class="value ${parseFloat(d.taxa_conversao) >= 10 ? 'green' : parseFloat(d.taxa_conversao) >= 5 ? 'yellow' : 'red'}">${d.taxa_conversao || 0}%</div>
      <div class="sub">meta: acima de 10%</div>
    </div>
    <div class="card">
      <div class="label">Média de Mensagens</div>
      <div class="value purple">${d.media_mensagens || 0}</div>
      <div class="sub">por conversa</div>
    </div>
    <div class="card">
      <div class="label">Cliques no Checkout</div>
      <div class="value yellow">${totalClicks}</div>
      <div class="sub">total de cliques</div>
    </div>
    <div class="card">
      <div class="label">Abandonos</div>
      <div class="value red">${d.abandonos}</div>
      <div class="sub">sem retorno +2h</div>
    </div>
  </div>

  <div class="grid2">
    <div class="panel">
      <h2>📊 Cliques no Checkout</h2>
      ${clicks.rows.length === 0 ? '<p style="color:#64748b;font-size:13px">Nenhum clique ainda</p>' :
        clicks.rows.map(r => `
          <div class="bar-wrap">
            <div class="bar-label"><span>${r.link_type}</span><span>${r.total} cliques</span></div>
            <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, parseInt(r.total) / Math.max(...clicks.rows.map(x => parseInt(x.total))) * 100)}%"></div></div>
          </div>`).join('')}
    </div>

    <div class="panel">
      <h2>💡 Dicas de Otimização</h2>
      ${parseFloat(d.taxa_conversao) < 5 ? `<div class="tip"><strong>⚠️ Taxa de conversão baixa</strong>Reforce mais cedo o teste de $1 por 7 dias.</div>` : ''}
      ${parseFloat(d.media_mensagens) > 10 ? `<div class="tip"><strong>⏱️ Conversas longas</strong>Leads com mais de 10 mensagens raramente convertem. Acione o fechamento direto.</div>` : ''}
      ${parseInt(d.abandonos) > parseInt(d.total_sessoes) * 0.5 ? `<div class="tip"><strong>🚪 Alto abandono</strong>Mais de 50% abandona. Revise a mensagem de boas-vindas.</div>` : ''}
      <div class="tip"><strong>✅ Próximo passo</strong>Com mais de 50 sessões os insights de aprendizado automático ficam ainda mais precisos.</div>
    </div>
  </div>

  <div class="grid2">
    <div class="panel">
      <h2>🕐 Últimas Sessões</h2>
      <table>
        <tr><th>Sessão</th><th>Msgs</th><th>Status</th><th>Última atividade</th></tr>
        ${ultimas.rows.map(s => `
          <tr>
            <td style="font-family:monospace;font-size:11px;color:#64748b">${s.id.substring(0, 16)}...</td>
            <td>${s.message_count}</td>
            <td><span class="badge ${s.converted ? 'badge-green' : 'badge-red'}">${s.converted ? '✓ Converteu' : '✗ Pendente'}</span></td>
            <td style="color:#64748b;font-size:12px">${new Date(s.last_message_at).toLocaleString('pt-BR')}</td>
          </tr>`).join('')}
      </table>
    </div>

    <div class="panel">
      <h2>🚧 Objeções Detectadas</h2>
      ${objections.rows.length === 0
        ? '<p style="color:#64748b;font-size:13px">Dados insuficientes ainda. Continue coletando conversas.</p>'
        : objections.rows.map(o => `<div class="objection">"${o.content.substring(0, 80)}..." <span style="color:#6366f1">(${o.freq}x)</span></div>`).join('')}
      <div style="margin-top:16px;padding:12px;background:#0f172a;border-radius:8px;font-size:12px;color:#64748b">
        💬 As objeções mais frequentes são usadas automaticamente para refinar o prompt do agente.
      </div>
    </div>
  </div>

</div>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>Erro: ${err.message}</pre>`);
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/', async (req, res) => {
  const stats = await pool.query('SELECT COUNT(*) as sessoes FROM sessions').catch(() => ({ rows: [{ sessoes: 0 }] }));
  res.json({
    status: 'online',
    agente: 'ChatCode Ilimitado Sales Agent v2',
    sessoes_no_banco: stats.rows[0].sessoes,
    node: process.version,
    uptime: Math.round(process.uptime())
  });
});

// ============================================================
// LIMPAR SESSÃO
// ============================================================
app.delete('/sessao/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    await pool.query('DELETE FROM messages WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    res.json({ ok: true, mensagem: 'Sessão removida' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Agente rodando na porta ${PORT}`);
  await initDB();
});
