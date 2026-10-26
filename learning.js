/* ============================================================
   APRENDIZADO DIARIO DO AGENTE
   Toda madrugada (06:00 UTC) uma IA le as conversas do dia, separa as que
   levaram ao clique no link das que abandonaram e propoe um "manual de
   vendas" curto (regras em espanhol). O manual so passa a valer depois que
   o Igor aprova em /aprendizado?key=... (pode editar antes).
   ============================================================ */

const MAX_SESSIONS = 80;
const MAX_CHARS_PER_SESSION = 1800;
const RULES_CACHE_MS = 10 * 60 * 1000;

let pool;
let rulesCache = { at: 0, rules: '' };

async function initLearning(dbPool) {
  pool = dbPool;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS playbooks (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      sessions_analyzed INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      report TEXT,
      rules TEXT,
      status TEXT DEFAULT 'pending',
      decided_at TIMESTAMPTZ
    );
  `);
}

/* Regras aprovadas que entram no prompt (cache de 10 min). */
async function getApprovedRules() {
  if (Date.now() - rulesCache.at < RULES_CACHE_MS) return rulesCache.rules;
  try {
    const { rows } = await pool.query(
      `SELECT rules FROM playbooks WHERE status = 'approved' ORDER BY decided_at DESC LIMIT 1`
    );
    rulesCache = { at: Date.now(), rules: rows[0]?.rules || '' };
  } catch {
    rulesCache = { at: Date.now(), rules: '' };
  }
  return rulesCache.rules;
}

function promptSection(rules) {
  if (!rules || !rules.trim()) return '';
  return `

APRENDIDO DE CONVERSACIONES REALES (aprobado por el equipo; aplícalo siempre que no contradiga las reglas de arriba):
${rules.trim()}`;
}

async function transcripts(since) {
  const { rows: sessions } = await pool.query(
    `SELECT id, converted, (to_jsonb(sessions) ->> 'outcome') AS outcome FROM sessions
      WHERE last_message_at >= $1 AND message_count >= 2
      ORDER BY last_message_at DESC LIMIT $2`,
    [since, MAX_SESSIONS]
  );
  const out = [];
  for (const s of sessions) {
    const { rows: msgs } = await pool.query(
      `SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC`,
      [s.id]
    );
    let text = msgs
      .map((m) => `${m.role === 'user' ? 'Cliente' : 'Agente'}: ${m.content.replace(/\s+/g, ' ').slice(0, 400)}`)
      .join('\n');
    if (text.length > MAX_CHARS_PER_SESSION) text = '…' + text.slice(-MAX_CHARS_PER_SESSION);
    out.push({ converted: s.converted, outcome: s.outcome, text });
  }
  return out;
}

const ANALYST_PROMPT = `Eres un analista de ventas. Analizas conversaciones reales entre un agente de IA que vende ChatCode por WhatsApp y posibles clientes en Latinoamérica.

Datos del producto (no los cambies ni inventes otros):
- ChatCode Ilimitado: US$19/mes cobrados hoy, con garantía de reembolso de 7 días, cancela cuando quiera. Es el producto principal. Ya NO existe la prueba de US$1 ni los 3 días de prueba.
- Menciona la garantía de reembolso de 7 días junto al precio al entregar el link, sin esconderla. Descarta reglas antiguas que ofrezcan la prueba de US$1, 3 días o 7 días de prueba.
- ChatCode Agencia: US$97/mes, solo para quien crea bots para sus clientes.
- No existen otros planes, descuentos ni funciones que no aparezcan en las conversaciones del agente.

Te paso conversaciones marcadas como "CLIENTE (COMPRÓ)" (la mejor señal: pagó), "CLIC EN EL LINK" (avanzó a la compra) o "ABANDONÓ". Da más peso a lo que llevó a "CLIENTE (COMPRÓ)". Y las reglas aprendidas que ya están vigentes.

Devuelve SOLO un JSON con este formato:
{
  "report": "Resumen en portugués de Brasil para el dueño, en markdown corto: 1) objeciones más frecuentes, 2) qué respuestas del agente llevaron al clic, 3) dónde se pierden los leads, 4) preguntas que el agente respondió mal o no supo responder.",
  "rules": ["regla 1", "regla 2"]
}

Reglas para "rules":
- Máximo 15 reglas, en español neutro, cada una con máximo 220 caracteres, accionables (ej.: "Cuando digan 'es caro', responde que...").
- Basadas en lo que REALMENTE funcionó en estas conversaciones. Mantén las reglas vigentes que sigan siendo válidas y mejora o reemplaza las que no.
- Nunca inventes funciones, precios, descuentos, garantías ni promesas. Nunca contradigas los datos del producto.
- Nada de spam, presión agresiva ni hablar de bloqueos de WhatsApp por iniciativa propia.`;

async function generatePlaybook() {
  const { rows: last } = await pool.query(
    `SELECT period_end FROM playbooks ORDER BY created_at DESC LIMIT 1`
  );
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const since = last[0]?.period_end && new Date(last[0].period_end) < dayAgo ? new Date(last[0].period_end) : dayAgo;
  const convs = await transcripts(since);
  if (convs.length < 3) return { skipped: true, reason: `Pocas conversaciones (${convs.length})` };

  const current = await getApprovedRules();
  const body = convs
    .map((c, i) => `### Conversación ${i + 1} — ${c.outcome === 'cliente' ? 'CLIENTE (COMPRÓ)' : c.converted ? 'CLIC EN EL LINK' : 'ABANDONÓ'}\n${c.text}`)
    .join('\n\n');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ANALYST_PROMPT },
        { role: 'user', content: `REGLAS VIGENTES:\n${current || '(ninguna todavía)'}\n\nCONVERSACIONES:\n\n${body}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const data = await r.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  const rules = (Array.isArray(parsed.rules) ? parsed.rules : [])
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 15)
    .map((x) => `- ${x.replace(/^[-•]\s*/, '').slice(0, 240)}`)
    .join('\n');
  const { rows } = await pool.query(
    `INSERT INTO playbooks (period_start, period_end, sessions_analyzed, conversions, report, rules)
     VALUES ($1, NOW(), $2, $3, $4, $5) RETURNING id`,
    [since, convs.length, convs.filter((c) => c.converted).length, String(parsed.report || ''), rules]
  );
  return { id: rows[0].id, sessions: convs.length };
}

/* Agenda: confere a cada 30 min; roda as 06:00 UTC se nao gerou nas
   ultimas 20h (Railway mantem o processo ligado). */
function startScheduler() {
  setInterval(async () => {
    try {
      if (new Date().getUTCHours() !== 6) return;
      const { rows } = await pool.query(
        `SELECT 1 FROM playbooks WHERE created_at > NOW() - INTERVAL '20 hours' LIMIT 1`
      );
      if (rows.length) return;
      const res = await generatePlaybook();
      console.log('📚 Aprendizado diário:', JSON.stringify(res));
    } catch (err) {
      console.error('Aprendizado diário falhou:', err.message);
    }
  }, 30 * 60 * 1000);
}

/* ---------- Pagina de aprovacao ---------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const md = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h4>$1</h4>')
    .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');

function authorized(req) {
  const key = process.env.AGENT_ADMIN_KEY;
  return Boolean(key) && (req.query.key === key || req.body?.key === key);
}

function page(content) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aprendizado do agente</title>
<style>
body{margin:0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f4f6;color:#1c1d21}
.wrap{max-width:860px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:24px;margin:0 0 4px}.sub{color:#6b6d76;margin:0 0 22px}
.card{background:#fff;border:1px solid #e8e8ec;border-radius:14px;padding:20px;margin-bottom:16px}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px}
.pending{background:#fff1e9;color:#c2410c}.approved{background:#e9f9ee;color:#15803d}.rejected,.replaced{background:#f0f0f3;color:#6b6d76}
textarea{width:100%;min-height:260px;box-sizing:border-box;border:1px solid #d9d9de;border-radius:10px;padding:12px;font:13px/1.5 ui-monospace,Menlo,monospace}
button{border:0;border-radius:9px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:14px}
.ok{background:#ff5924;color:#fff}.no{background:#f0f0f3;color:#3a3b40}.ghost{background:#fff;border:1px solid #d9d9de}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.muted{color:#6b6d76;font-size:13px}
.report{font-size:14px;line-height:1.55}.report h4{margin:12px 0 4px}.report li{margin-left:18px}
pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,Menlo,monospace;background:#f7f7f9;border-radius:10px;padding:12px;margin:0}
</style></head><body><div class="wrap">${content}</div></body></html>`;
}

function registerLearningRoutes(app) {
  app.get('/aprendizado', async (req, res) => {
    if (!authorized(req))
      return res.status(403).send(page('<h1>Acesso negado</h1><p class="sub">Abra com ?key=… (variável AGENT_ADMIN_KEY no Railway).</p>'));
    const key = esc(req.query.key);
    const { rows } = await pool.query(`SELECT * FROM playbooks ORDER BY created_at DESC LIMIT 15`);
    const current = rows.find((p) => p.status === 'approved');
    const pending = rows.find((p) => p.status === 'pending');
    const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
    let html = `<h1>Aprendizado do agente</h1><p class="sub">Toda madrugada a IA analisa as conversas do dia e propõe regras de venda. Só valem depois que você aprova.</p>`;
    if (pending) {
      html += `<div class="card"><div class="row" style="justify-content:space-between"><b>Nova proposta</b><span class="tag pending">Aguardando aprovação</span></div>
        <p class="muted">${fmt(pending.created_at)} · ${pending.sessions_analyzed} conversas analisadas · ${pending.conversions} clicaram no link</p>
        <div class="report">${md(pending.report)}</div>
        <form method="post" action="/aprendizado/${pending.id}/aprovar"><input type="hidden" name="key" value="${key}">
        <p><b>Regras propostas</b> <span class="muted">(pode editar antes de aprovar; uma por linha)</span></p>
        <textarea name="rules">${esc(pending.rules)}</textarea>
        <div class="row" style="margin-top:10px"><button class="ok" type="submit">Aprovar e ativar</button>
        <button class="no" formaction="/aprendizado/${pending.id}/rejeitar" type="submit">Descartar</button></div></form></div>`;
    }
    html += `<div class="card"><div class="row" style="justify-content:space-between"><b>Regras em uso pelo agente</b>${current ? `<span class="tag approved">Ativas desde ${fmt(current.decided_at)}</span>` : '<span class="tag rejected">Nenhuma ainda</span>'}</div>
      ${current ? `<pre style="margin-top:10px">${esc(current.rules)}</pre>` : '<p class="muted">Quando você aprovar a primeira proposta, as regras aparecem aqui.</p>'}</div>`;
    html += `<div class="card"><div class="row" style="justify-content:space-between"><b>Gerar agora</b>
      <form method="post" action="/aprendizado/gerar"><input type="hidden" name="key" value="${key}"><button class="ghost" type="submit">Analisar conversas das últimas 24h</button></form></div>
      <p class="muted">Leva uns 30 segundos. Também roda sozinho todo dia às 03:00 (Brasília).</p></div>`;
    if (rows.length)
      html += `<div class="card"><b>Histórico</b>${rows
        .map((p) => `<p class="muted"><span class="tag ${p.status}">${{ pending: 'Pendente', approved: 'Aprovada', rejected: 'Descartada', replaced: 'Substituída' }[p.status] || p.status}</span> ${fmt(p.created_at)} · ${p.sessions_analyzed} conversas</p>`)
        .join('')}</div>`;
    res.send(page(html));
  });

  app.post('/aprendizado/:id/aprovar', async (req, res) => {
    if (!authorized(req)) return res.status(403).end();
    const rules = String(req.body.rules || '').trim().slice(0, 5000);
    await pool.query(`UPDATE playbooks SET status = 'replaced' WHERE status = 'approved'`);
    await pool.query(`UPDATE playbooks SET status = 'approved', rules = $2, decided_at = NOW() WHERE id = $1`, [req.params.id, rules]);
    rulesCache = { at: 0, rules: '' };
    res.redirect(`/aprendizado?key=${encodeURIComponent(req.body.key)}`);
  });

  app.post('/aprendizado/:id/rejeitar', async (req, res) => {
    if (!authorized(req)) return res.status(403).end();
    await pool.query(`UPDATE playbooks SET status = 'rejected', decided_at = NOW() WHERE id = $1 AND status = 'pending'`, [req.params.id]);
    res.redirect(`/aprendizado?key=${encodeURIComponent(req.body.key)}`);
  });

  app.post('/aprendizado/gerar', async (req, res) => {
    if (!authorized(req)) return res.status(403).end();
    try {
      const result = await generatePlaybook();
      if (result.skipped)
        return res.send(page(`<h1>Nada para analisar</h1><p class="sub">${esc(result.reason)} nas últimas 24h.</p><p><a href="/aprendizado?key=${encodeURIComponent(req.body.key)}">Voltar</a></p>`));
    } catch (err) {
      return res.status(500).send(page(`<h1>Erro</h1><p class="sub">${esc(err.message)}</p>`));
    }
    res.redirect(`/aprendizado?key=${encodeURIComponent(req.body.key)}`);
  });
}

module.exports = { initLearning, getApprovedRules, promptSection, startScheduler, registerLearningRoutes, generatePlaybook };
