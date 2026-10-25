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
  const prompt = context.buildSystemPrompt('test', null, canal, 'La prueba anterior duraba 7 días.');
  assert.ok(prompt.includes('las nuevas pruebas duran 3 días'));
  assert.ok(prompt.includes('sin esconderlos'));
  assert.ok(prompt.includes('desde la primera pregunta; no le hagas insistir'));
  assert.ok(prompt.includes('su fecha real de cobro en Stripe/panel prevalece'));
  assert.ok(prompt.includes('US$1 hoy por 3 días, después US$19/mes'));
  assert.ok(!prompt.includes('Probar 7 días'));
  assert.ok(prompt.includes('PRIMER MENSAJE'));
  assert.ok(prompt.includes('¡Hola! 👋 Soy el asistente de ChatCode, un bot hecho con nuestra propia plataforma. ¿Qué tipo de negocio tienes?'));
}
console.log('Agente: oferta de 3 dias, transparência e precedência sobre regras antigas verificadas.');
