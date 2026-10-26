const assert = require('node:assert/strict');
const { splitCta, sendCta, mode } = require('./cta');
const B = 'https://agente.example';
const raw = 'Te dejo el acceso: US$1 hoy por 3 días, después US$19/mes, cancelas cuando quieras.\n\nhttps://typebot-agent-deploy-production.up.railway.app/checkout/normal?sessionId=abc123\n';
const r = splitCta(raw, B);
assert.equal(r.url, `${B}/p/normal?sessionId=abc123`);
assert.ok(!r.texto.includes('/checkout/') && r.texto.includes('US$1 hoy por 3 días'));
assert.equal(splitCta('Hola sin link', B).url, null);
assert.equal(splitCta('Empieza aquí: https://x.y/checkout/normal?sessionId=z.', B).texto, 'Empieza aquí.');
assert.equal(mode(), 'off');

(async () => {
  // Fallback: se o botao falha, o link vai como texto simples
  process.env.EVOLUTION_API_URL = 'https://evo.test'; process.env.EVOLUTION_API_KEY = 'k'; process.env.CTA_MODE = 'button';
  const calls = [];
  global.fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: !String(url).includes('sendButtons'), status: 500, json: async () => ({}) }; };
  const ok = await sendCta({ instancia: 'cc-abc', remoteJid: '5215512345678@s.whatsapp.net', url: 'https://u/p/normal?sessionId=1', baseUrl: B });
  assert.ok(ok);
  assert.equal(calls.length, 2);
  assert.ok(calls[0][0].endsWith('/sendButtons/cc-abc') && calls[0][1].buttons[0].type === 'url');
  assert.ok(calls[1][0].endsWith('/sendText/cc-abc') && calls[1][1].text === 'https://u/p/normal?sessionId=1');
  // Entradas invalidas nao enviam nada
  calls.length = 0;
  assert.equal(await sendCta({ instancia: '../x', remoteJid: '5215512345678@s.whatsapp.net', url: 'u', baseUrl: B }), false);
  assert.equal(await sendCta({ instancia: 'cc-a', remoteJid: '{{remoteJid}}', url: 'u', baseUrl: B }), false);
  assert.equal(calls.length, 0);
  console.log('Agente: botao CTA (link -> /p/, texto sem link cru, fallback para link simples, entradas invalidas) verificado.');
})();
