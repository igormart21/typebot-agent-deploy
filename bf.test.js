const assert = require('node:assert/strict');
const { offer, bfOn } = require('./offer');

const realNow = Date.now;
const at = (iso) => { Date.now = () => Date.parse(iso); };

// Fora da janela: segue a oferta normal.
at('2026-11-26T23:59:00-05:00');
assert.equal(bfOn(), false);
assert.notEqual(offer().mode, 'blackfriday');

// Dentro da janela: modo Black Friday (27/11 00:00 a 1/12 23:59, UTC-5).
for (const trial of [undefined, 'true']) {
  if (trial) process.env.TRIAL_ENABLED = trial; else delete process.env.TRIAL_ENABLED;
  at('2026-11-27T00:00:00-05:00');
  assert.equal(bfOn(), true);
  const o = offer();
  assert.equal(o.mode, 'blackfriday');
  assert.ok(o.product.includes('US$149') && o.product.includes('US$228') && o.product.includes('1 de diciembre'));
  assert.ok(o.product.includes('NUNCA hables de cupos limitados'));
  assert.ok(o.product.includes('US$749'));
  at('2026-12-01T23:59:00-05:00');
  assert.equal(offer().mode, 'blackfriday');
  // A garantia de 7 dias e a oferta anual NAO podem ser bloqueadas pelo filtro de oferta antiga.
  assert.ok(!offer().oldOffer.test('Black Friday: US$149 al año con garantía de reembolso de 7 días'));
  // Ofertas mortas e vagas inventadas continuam bloqueadas.
  assert.ok(offer().oldOffer.test('pago único de por vida'));
  assert.ok(offer().oldOffer.test('quedan cupos limitados'));
  assert.ok(offer().oldOffer.test('son las últimas plazas'));
}

// Depois do prazo: volta ao normal.
at('2026-12-02T00:00:00-05:00');
assert.equal(bfOn(), false);
assert.notEqual(offer().mode, 'blackfriday');

Date.now = realNow;
delete process.env.TRIAL_ENABLED;
console.log('bf.test.js ok');
