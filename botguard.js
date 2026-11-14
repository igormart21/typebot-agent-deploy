/* Trava contra outro robo (IA, menu automatico, resposta fora do horario).
   Sem chamar a OpenAI: so olha o texto e o ritmo das mensagens da sessao.
   `recent` = mensagens do usuario desta sessao, mais novas primeiro, ja com a atual:
   [{ content, at (ms) }]. Devolve o motivo ou null. */

/* Frases que robos dizem de si mesmos (es/pt/en). Especificas de proposito:
   "eres un bot?" dito por uma pessoa nao pode bater. */
const BOT_PHRASES = [
  /\b(soy|somos|sou)\s+(un|una|um|uma)?\s*(asistente|assistente|agente|bot|chatbot)\s+(virtual|de ia|de inteligencia artificial|autom[aá]tico)/i,
  /\bi(?:'m| am)\s+an?\s+(ai|virtual)\s+(assistant|agent)/i,
  /\b(mensaje|mensagem|message|respuesta|resposta)\s+(autom[aá]tic[oa]|automated)/i,
  /\b(atendimento|atenci[oó]n)\s+(autom[aá]tic[oa]|virtual)/i,
  /\b(digite|escribe|escriba|presiona|marque|type|reply)\s+(el\s+n[uú]mero\s+)?\d+\s+(para|to)\b/i,
  /\b(men[uú]|menu)\s+(principal|inicial)\b/i,
  /\bfuera\s+del\s+horario|fora\s+do\s+hor[aá]rio|outside\s+(of\s+)?(our\s+)?business\s+hours/i,
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function botReason(texto, recent, { now = Date.now(), dayCap = 60 } = {}) {
  const t = String(texto || '');
  if (BOT_PHRASES.some((re) => re.test(t))) return 'frase de robo';
  /* Rajada: 6 ou mais mensagens em 2 minutos nao e gente digitando. */
  if (recent.filter((m) => now - m.at < 120000).length >= 6) return 'rajada';
  /* Menu repetido: o mesmo texto (com 15+ letras) pela 3a vez nas ultimas 10. */
  const n = norm(t);
  if (n.length >= 15 && recent.slice(0, 10).filter((m) => norm(m.content) === n).length >= 3) return 'texto repetido';
  /* Teto por dia: conversa de venda normal fica bem abaixo disso. */
  if (recent.filter((m) => now - m.at < 86400000).length >= dayCap) return 'teto diario';
  return null;
}

module.exports = { botReason };
