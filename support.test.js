const assert = require('node:assert/strict');
const { MANUAL, buildSupportPrompt } = require('./support');
assert.ok(MANUAL.includes('máximo 4 dispositivos vinculados'));
assert.ok(MANUAL.includes('un número aparte para el bot'));
assert.ok(MANUAL.includes('dejar 3 estaciones'));
assert.ok(buildSupportPrompt({ customer_plan: 'ilimitado' }, 'whatsapp').includes('LÍMITE DE WHATSAPP'));
console.log('Agente: limite de 4 dispositivos do WhatsApp e as duas saidas estao no manual de suporte.');
