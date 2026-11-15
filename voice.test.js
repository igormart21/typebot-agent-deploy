const assert = require('node:assert/strict');
const v = require('./voice');
assert.ok(v.leadSpoke('[audio] hola') && v.leadSpoke('[Audio]hola') && !v.leadSpoke('hola [audio]'));
assert.ok(v.speakable('Claro, son US$19 al mes con garantía de 7 días.'));
assert.ok(!v.speakable('mira https://x.com') && !v.speakable('a'.repeat(501)) && !v.speakable('') && !v.speakable('- uno\n- dos'));
delete process.env.AGENT_VOICE;
assert.equal(v.enabled(), false);
(async () => {
  assert.equal(await v.replyWithVoice({ instancia: 'x', remoteJid: '1234567@s.whatsapp.net', texto: 'hola', leadTexto: '[audio] hola' }), false);
  process.env.AGENT_VOICE = 'on'; process.env.ELEVENLABS_API_KEY = 'k'.repeat(12);
  assert.equal(v.enabled(), true);
  assert.equal(await v.replyWithVoice({ instancia: 'x', remoteJid: '1234567@s.whatsapp.net', texto: 'hola', leadTexto: 'texto normal' }), false);
  assert.equal(await v.replyWithVoice({ instancia: 'x', remoteJid: 'mal', texto: 'hola', leadTexto: '[audio] hola' }), false);
  console.log('voice ok');
})();
