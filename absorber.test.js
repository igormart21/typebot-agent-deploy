const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('index.js', 'utf8');
const start = source.indexOf('const JID_RE');
const end = source.indexOf('async function getHistory');
const calls = [];
let fail = false;
const pool = {
  query: async (sql, args) => {
    calls.push([sql.split(' ')[0], args]);
    if (fail) throw new Error('db caiu');
    if (sql.startsWith('DELETE')) return { rows: [
      { content: 'segundo', created_at: new Date('2026-10-26T12:00:00Z') },
      { content: 'primero', created_at: new Date('2026-10-26T10:00:00Z') },
    ] };
    return { rows: [] };
  },
};
const ctx = { pool, console, String };
vm.createContext(ctx);
vm.runInContext(source.slice(start, end), ctx);
(async () => {
  await ctx.absorberRemarketing('s1', '{{remoteJid}}');
  await ctx.absorberRemarketing('s1', '');
  assert.equal(calls.length, 0, 'jid invalido nao consulta o banco');
  await ctx.absorberRemarketing('s1', '5215512345678@s.whatsapp.net');
  assert.deepEqual(calls.map((c) => c[0]), ['DELETE', 'INSERT', 'INSERT']);
  assert.equal(calls[1][1][2], 'primero', 'insere na ordem em que foram enviadas');
  fail = true;
  await ctx.absorberRemarketing('s1', '5215512345678@s.whatsapp.net');
  console.log('Agente: remarketing entra no historico na ordem certa e nunca derruba a resposta.');
})();
