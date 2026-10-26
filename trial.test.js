const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { promptSection } = require('./learning');
const source = fs.readFileSync('index.js', 'utf8');
const start = source.indexOf('function buildSystemPrompt(');
const end = source.indexOf('\n// ============================================================', start);
const context = { BASE_URL: 'https://agent.example', WHATSAPP_URL: 'https://wa.me/example', promptSection };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
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
console.log('Agente: oferta de US$19 com garantia de 7 dias, sem teste, e precedencia sobre regras antigas verificadas.');
