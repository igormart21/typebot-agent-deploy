const assert = require('node:assert/strict');
const { waitlistReply, registerPhone, preOpen } = require('./blackfriday');

const dentro = Date.parse('2026-11-25T12:00:00-05:00');
// Janela: 24/11 00:00 a 27/11 00:00 (UTC-5)
assert.equal(preOpen(Date.parse('2026-11-23T23:59:00-05:00')), false);
assert.equal(preOpen(Date.parse('2026-11-24T00:00:00-05:00')), true);
assert.equal(preOpen(Date.parse('2026-11-26T23:59:00-05:00')), true);
assert.equal(preOpen(Date.parse('2026-11-27T00:00:00-05:00')), false);

// Resposta fixa, sem pergunta no fim e sem vagas inventadas.
const r = waitlistReply('Quiero que me avisen de la Black Friday de ChatCode', [], dentro);
assert.ok(r.startsWith('¡Listo! Te anoto en la lista.'));
assert.ok(r.includes('US$149') && r.includes('27 de noviembre'));
assert.ok(!r.includes('?') && !/cupos|plazas|vagas/i.test(r), 'sem pergunta e sem escassez falsa');
// Segunda vez: confirma que ja esta na lista, tambem sem pergunta.
const again = waitlistReply('black friday?', [{ role: 'assistant', content: r }], dentro);
assert.ok(again.startsWith('Ya estás en la lista') && !again.includes('?'));
// Mensagem que nao e sobre Black Friday, ou fora da janela: nao intercepta.
assert.equal(waitlistReply('Hola, quiero probar ChatCode', [], dentro), null);
assert.equal(waitlistReply('black friday', [], Date.parse('2026-11-28T12:00:00-05:00')), null);
assert.equal(waitlistReply('black friday', [], Date.parse('2026-11-20T12:00:00-05:00')), null);

(async () => {
  // O registro usa o segredo e manda so os digitos do telefone.
  process.env.REMARKETING_SECRET = 'segredo-teste';
  let visto;
  const ok = await registerPhone('5511999998888@s.whatsapp.net', async (url, init) => { visto = { url, init }; return { ok: true }; });
  assert.equal(ok, true);
  assert.ok(visto.url.endsWith('/api/blackfriday/whatsapp'));
  assert.equal(visto.init.headers.Authorization, 'Bearer segredo-teste');
  assert.equal(JSON.parse(visto.init.body).phone, '5511999998888');
  // Falha de rede nunca quebra a conversa.
  assert.equal(await registerPhone('5511999998888@s.whatsapp.net', async () => { throw new Error('rede'); }), false);
  delete process.env.REMARKETING_SECRET;
  assert.equal(await registerPhone('5511999998888@s.whatsapp.net', async () => ({ ok: true })), false);
  console.log('blackfriday.test.js ok');
})();
