const assert = require('node:assert/strict');
const { botReason } = require('./botguard');
const now = 1_000_000_000;
const msg = (c, ago = 0) => ({ content: c, at: now - ago });
const r = (t, recent) => botReason(t, recent ?? [msg(t)], { now });

assert.equal(r('Hola, quiero información'), null);
assert.equal(r('¿Eres un bot?'), null); // pessoa perguntando
assert.equal(r('Soy un asistente virtual de Clínica Sol'), 'frase de robo');
assert.equal(r('Este es un mensaje automático, te responderemos pronto'), 'frase de robo');
assert.equal(r('Digite 1 para falar com vendas'), 'frase de robo');
assert.equal(r('Estamos fuera del horario de atención'), 'frase de robo');
// rajada: 6 em 2 min
const rajada = Array.from({ length: 6 }, (_, i) => msg('ok ' + i, i * 10000));
assert.equal(r('ok 0', rajada), 'rajada');
assert.equal(r('ok', rajada.slice(0, 5)), null);
// repetido 3x
const rep = [msg('Bienvenido, elige una opción', 0), msg('Bienvenido, elige una opcion!', 400000), msg('bienvenido elige una opción', 800000)];
assert.equal(r('Bienvenido, elige una opción', rep), 'texto repetido');
// teto diario
const dia = Array.from({ length: 60 }, (_, i) => msg('msg ' + i, i * 600000));
assert.equal(r('msg x', dia), 'teto diario');
console.log('botguard: frases de robo, rajada, texto repetido e teto diario verificados; pessoa normal passa.');
