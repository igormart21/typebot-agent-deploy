const express = require('express');
const { Pool } = require('pg');
const app = express();
app.use(express.json());

// ============================================================
// BANCO DE DADOS - Supabase PostgreSQL
// ============================================================
const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = process.env.BASE_URL || 'https://typebot-agent-deploy-production.up.railway.app';
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
  const result = await pool.query(
    'SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2',
    [sessionId, MAX_HISTORY]
  );
  return result.rows;
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
function buildSystemPrompt(sessionId, insights) {
  const linkNormal = `${BASE_URL}/checkout/normal?sessionId=${sessionId}`;
  const linkDesconto = `${BASE_URL}/checkout/discount?sessionId=${sessionId}`;
  const linkRevenda = `${BASE_URL}/checkout/revenda?sessionId=${sessionId}`;

  let prompt = `Eres un Agente de Ventas IA especializado EXCLUSIVAMENTE en Typebot Ilimitado.

PERSONALIDAD:
- Eres humano, cálido, conversacional y empático
- NUNCA robótico ni repetitivo
- Respondes UNA sola duda a la vez, de forma breve y natural
- Conduces gradualmente hacia el cierre
- Usas el historial para personalizar cada respuesta y NUNCA repites lo que ya dijiste
- Te adaptas: si el lead es técnico, hablas técnico; si es novato, simplificas
- Eres como un amigo experto, no un vendedor presionado
- Varía siempre tu lenguaje. Nunca uses la misma frase dos veces.

IDIOMA: Español neutro latinoamericano. SIEMPRE.

PRODUCTO - TYPEBOT ILIMITADO:
- Plataforma online en la nube (NO es un curso)
- Precio normal: $29 USD pago único, acceso vitalicio
- SI el lead se queja del precio o pide descuento: ofrece $19 USD (solo si reclama, nunca antes)
- Sin mensualidades, sin límite de bots, sin restricciones
- Funciona 24/7, sin PC encendido
- Sin programación, desde PC o celular
- Normalmente cuesta $89 USD/mes → más de $1,000 al año
- Link principal de compra: [¡Quiero mi acceso vitalicio!](${linkNormal})
- Link descuento $19 (solo si reclama precio): [¡Quiero con descuento!](${linkDesconto})
- Garantía: 7 días por Hotmart

CAPACIDADES DE LA PLATAFORMA:
- Bots y agentes con IA integrada (como yo mismo — soy la demostración viva)
- WhatsApp via QR code (fácil, no requiere API oficial Meta)
- Instagram, Facebook, sitios web, email
- Ventas, soporte, agendamientos, formularios, embudos
- Imágenes, videos, PDFs, catálogos
- Integración con CRM, pagos, IA
- Mensajes masivos (dentro de reglas de WhatsApp)
- Tutorial completo incluido, del básico al avanzado

PRODUCTO EXTRA - BOTZILLA IA (mencionar solo si el lead quiere automatizar ventas):
- Agente de ventas listo y preentrenado
- Compatible con WhatsApp, Instagram, sitios web
- Activación en 3 minutos, acceso vitalicio
- Mencionar como complemento, no como sustituto

REVENTA (solo si preguntan):
- Puede revender bots como servicio creado en la plataforma
- Para revender la plataforma (marca blanca): $99 USD
- Link reventa: [¡Quiero ser revendedor!](${linkRevenda})

VIDEOS DEMO (solo si piden):
- Video 1: https://iframe.mediadelivery.net/play/477421/b26cdc80-9f93-41af-a671-e30f003830c5
- Video 2: https://iframe.mediadelivery.net/play/477421/a94a954d-29f3-432f-b47c-687ccead4c59
- Presenta el link como botón con texto persuasivo, nunca el link crudo

MANEJO DE OBJECIONES:
- "¿Por qué $29?" → Oferta promocional estratégica. Normal vale +$1,000/año. Aquí pagas una vez y es tuyo para siempre.
- "¿Es seguro?" → Hotmart, 7 días de garantía, plataforma 100% confiable en LATAM
- "¿Necesito programar?" → No, 100% visual, arrastrar y soltar
- "¿Funciona sin PC?" → Sí, 24/7 en la nube
- "¿Solo WhatsApp?" → No, múltiples canales
- "¿Mensajes masivos?" → Sí
- "¿Tiene IA?" → Sí, bots tipo agentes IA, exactamente como yo
- "¿No tengo API de Meta?" → No es necesaria, conecta por QR code fácilmente

REGLAS DE CONVERSACIÓN (CRÍTICAS):
1. Responde UNA cosa a la vez. Máximo 3-4 líneas por respuesta.
2. Usa el historial. NUNCA repitas información ya dada.
3. Cuando el lead dice "sí", "ok", "dale", "me interesa", "quiero" → entrega el link inmediatamente, sin repetir info previa
4. Al dar el link usa texto persuasivo como botón: [¡Quiero mi acceso vitalicio!](${linkNormal})
5. Termina cada respuesta con UNA pregunta de avance (varía siempre)
6. NUNCA hagas listas largas. NUNCA párrafos largos.
7. Si detectas que el lead está listo → cierra directo con el link
8. Cuando el lead diga "sí" después de una pregunta de cierre → da el link YA, sin más preámbulos

SOBRE TI MISMO:
Cuando pregunten qué eres o cómo funciona → di que eres un agente IA de ventas, y que exactamente así funcionan los agentes que el cliente puede crear con Typebot Ilimitado. Eres la demostración viva del producto.

PRIORIDAD MÁXIMA: Convertir el lead. Cada respuesta debe acercarlo un paso más a la compra. Enfoca en cómo aumenta las VENTAS, no la productividad.`;

  // Injeta insights reais de conversão no prompt
  if (insights && parseInt(insights.total_sessions) > 10) {
    const taxa = ((parseInt(insights.total_conversions) / parseInt(insights.total_sessions)) * 100).toFixed(1);
    const avgConvertido = insights.avg_msgs_converted || 0;
    const avgAbandonado = insights.avg_msgs_abandoned || 0;
    const maisDesconto = parseInt(insights.clicks_discount) > parseInt(insights.clicks_normal);

    prompt += `

INTELIGÊNCIA DE CONVERSÃO (dados reais das suas conversas):
- Taxa de conversão atual: ${taxa}%
- Leads que compram respondem em média ${avgConvertido} mensagens
- Leads que abandonam ficam em média ${avgAbandonado} mensagens sem converter
- Link mais clicado: ${maisDesconto ? 'DESCONTO ($19) — use-o estrategicamente' : 'NORMAL ($29) — leads aceitam o preço cheio'}
- Se o lead ultrapassar ${Math.round(parseFloat(avgAbandonado) * 0.8)} mensagens sem avançar, mude de abordagem ou ofereça o desconto
Use esses dados para fechar mais vendas. Adapte sua abordagem ao que está funcionando.`;
  }

  return prompt;
}

// ============================================================
// ROTA PRINCIPAL - Webhook do Typebot
// ============================================================
app.post('/agente', async (req, res) => {
  try {
    const { sessionId, mensagem } = req.body;

    if (!mensagem) {
      return res.status(400).json({ erro: 'mensagem é obrigatória' });
    }

    const id = sessionId || 'preview-session';

    // Busca histórico do banco
    const historico = await getHistory(id);

    // Salva mensagem do usuário
    await saveMessage(id, 'user', mensagem);
    historico.push({ role: 'user', content: mensagem });

    // Busca insights para enriquecer o prompt
    const insights = await getInsights();
    const systemPrompt = buildSystemPrompt(id, insights);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historico
        ]
      })
    });

    if (!response.ok) {
      const erro = await response.text();
      console.error('Erro OpenAI API:', erro);
      return res.status(500).json({ erro: 'Erro ao chamar OpenAI API', detalhe: erro });
    }

    const data = await response.json();
    const resposta = data.choices?.[0]?.message?.content;

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
    console.error('Erro interno:', err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// ============================================================
// RASTREAMENTO DE CLIQUES NO CHECKOUT
// ============================================================
app.get('/checkout/:tipo', async (req, res) => {
  const { tipo } = req.params;
  const { sessionId } = req.query;

  const links = {
    normal: 'https://pay.hotmart.com/F103014542L?off=bjwg8x95&checkoutMode=10',
    discount: 'https://pay.hotmart.com/F103014542L?off=1kehk6lh&checkoutMode=10',
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

  res.redirect(links[tipo] || links.normal);
});

// ============================================================
// ANALYTICS
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

    const clicks = await pool.query(`
      SELECT link_type, COUNT(*) as total
      FROM link_clicks
      GROUP BY link_type
      ORDER BY total DESC
    `);

    const ultimas = await pool.query(`
      SELECT id, message_count, converted, last_message_at
      FROM sessions
      ORDER BY last_message_at DESC
      LIMIT 10
    `);

    res.json({
      resumo: stats.rows[0],
      cliques_checkout: clicks.rows,
      ultimas_sessoes: ultimas.rows
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/', async (req, res) => {
  const stats = await pool.query('SELECT COUNT(*) as sessoes FROM sessions').catch(() => ({ rows: [{ sessoes: 0 }] }));
  res.json({
    status: 'online',
    agente: 'Typebot Ilimitado Sales Agent v2',
    sessoes_no_banco: stats.rows[0].sessoes
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
