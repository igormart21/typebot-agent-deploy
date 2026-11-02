const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { promptSection } = require('./learning');
const { offer } = require('./offer');
const source = fs.readFileSync('index.js', 'utf8');
const start = source.indexOf('function buildSystemPrompt(');
const end = source.indexOf('\n// ============================================================', start);
const context = { BASE_URL: 'https://agent.example', WHATSAPP_URL: 'https://wa.me/example', promptSection, offer };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

// Padrao (TRIAL_ENABLED desligado): US$19 na hora com garantia de 7 dias.
delete process.env.TRIAL_ENABLED;
for (const canal of ['web', 'whatsapp']) {
  const prompt = context.buildSystemPrompt('test', null, canal, 'La prueba anterior era de US$1 por 7 días.');
  assert.ok(prompt.includes('US$19 al mes, cobrados hoy, con GARANTÍA DE REEMBOLSO DE 7 DÍAS'));
  assert.ok(prompt.includes('Ya NO existe la prueba de US$1'));
  assert.ok(prompt.includes('Nunca presentes un precio sin la garantía'));
  assert.ok(prompt.includes('US$19/mes, con garantía de reembolso de 7 días, cancelas cuando quieras'));
  if (canal === 'web') assert.ok(prompt.includes('[Empezar por US$19]'));
  assert.ok(prompt.includes('su fecha real de cobro en Stripe/panel prevalece'));
  assert.ok(!prompt.includes('Empezar por US$1]'), 'o link nao pode oferecer US$1');
  assert.ok(!prompt.includes('US$1 hoy'));
  assert.ok(!prompt.includes('prueba de US$1 con tarjeta'));
}
assert.ok(offer().oldOffer.test('prueba de 3 días por US$1'), 'sem teste, a oferta de teste e bloqueada');

// TRIAL_ENABLED ligado: teste de 3 dias por US$1, sem garantia de reembolso.
process.env.TRIAL_ENABLED = 'true';
for (const canal of ['web', 'whatsapp']) {
  const prompt = context.buildSystemPrompt('test', null, canal, '');
  assert.ok(prompt.includes('prueba de 3 días por US$1 (acceso completo) y después US$19 al mes'));
  assert.ok(prompt.includes('Ya NO existe la garantía de reembolso de 7 días'));
  assert.ok(prompt.includes('3 días de prueba por US$1, después US$19/mes, cancelas cuando quieras'));
  if (canal === 'web') assert.ok(prompt.includes('[Probar 3 días por US$1]'));
  assert.ok(!prompt.includes('[Empezar por US$19]'));
  assert.ok(!prompt.includes('GARANTÍA DE REEMBOLSO DE 7 DÍAS:'));
  assert.ok(!prompt.includes('Nunca presentes un precio sin la garantía'));
}
assert.equal(offer().mode, 'trial');
assert.ok(!offer().oldOffer.test('3 días de prueba por US$1, después US$19/mes'), 'com teste, a oferta de teste sai');
assert.ok(offer().oldOffer.test('Tienes garantía de reembolso de 7 días'), 'com teste, a garantia antiga e bloqueada');
assert.ok(offer().oldOffer.test('pago único de $29'));
delete process.env.TRIAL_ENABLED;
console.log('Agente: oferta por TRIAL_ENABLED (padrao US$19 com garantia de 7 dias; ligado, teste de 3 dias por US$1) e travas verificadas.');
