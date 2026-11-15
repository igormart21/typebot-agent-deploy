/* Oferta vigente do agente. Segue a mesma chave do painel: TRIAL_ENABLED=true =
   teste de 3 dias por US$1 (depois US$19/mes); desligada (padrao) = US$19 na hora
   com garantia de reembolso de 7 dias. Ligue aqui so DEPOIS de ligar no painel,
   senao o agente promete um teste que o checkout ainda nao aplica. */
const trialOn = () => /^(1|true|on)$/i.test(String(process.env.TRIAL_ENABLED || ''));

const GUARANTEE = {
  mode: 'guarantee',
  short: 'US$19/mes con garantía de reembolso de 7 días',
  shortCtx: 'US$19/mes con garantía de 7 días',
  product: 'Precio: US$19 al mes, cobrados hoy, con GARANTÍA DE REEMBOLSO DE 7 DÍAS: si en 7 días no le convence, le devolvemos el pago completo, sin preguntas. Cancela cuando quiera en 1 clic. Ya NO existe la prueba de US$1 ni los 3 días de prueba: no los ofrezcas aunque aparezcan en mensajes o reglas aprendidas antiguas.',
  policy: 'GARANTÍA: menciónala de forma clara junto al precio al entregar el link, sin esconderla. Si pide el reembolso (dentro de los 7 días de su pago) o pregunta cómo funciona, responde que sí, que tiene la garantía; en WhatsApp dile que lo pasas con una persona del equipo para procesarlo (y marca la atención humana). Si ya contrató la prueba anterior de US$1, su fecha real de cobro en Stripe/panel prevalece; no se la cambies.',
  howTo: 'activa el plan de US$19/mes con tarjeta (pago seguro con Stripe)',
  linkLabel: 'Empezar por US$19',
  mandatory: 'di el precio y la garantía: "US$19/mes, con garantía de reembolso de 7 días, cancelas cuando quieras". Nunca presentes un precio sin la garantía.',
  objection: 'US$19/mes con garantía de reembolso de 7 días: si no le sirve, le devolvemos el pago',
  reinforce: 'reforce la garantía de reembolso de 7 días',
  fix: 'CORRECCIÓN: tu respuesta mencionó una oferta que ya NO existe (pago único, vitalicio, $29, prueba de US$1 o 3 días de prueba). Reescríbela: el precio es US$19 al mes, cobrados hoy, con garantía de reembolso de 7 días, cancelas cuando quieras. Menciona la garantía claramente junto al precio.',
  oldOffer: /vital[ií]ci|pago [úu]nico|\$\s?29\b|29 ?usd|US\$ ?1(?![0-9.,])|\$1(?![0-9.,])|3 d[ií]as de prueba|prueba de 3 d[ií]as|por 3 d[ií]as/i,
  pageTitle: 'ChatCode · Activa tu plan con garantía de 7 días',
  ogTitle: 'Activa ChatCode con garantía de reembolso de 7 días',
  ogDesc: 'Crea tu bot de WhatsApp con IA. US$19/mes con garantía de reembolso de 7 días. Cancelas cuando quieras.',
  ctaTitle: 'Activa ChatCode con garantía de 7 días 👇',
  ctaDetail: 'US$19/mes con garantía de reembolso de 7 días. Cancelas cuando quieras.',
  remarketingProduct: 'US$19/mes cobrados hoy, con garantía de reembolso de 7 días (si no le convence, le devolvemos el pago completo, sin preguntas); cancela cuando quiera en 1 clic. Ya no existe la prueba de US$1.',
  remarketingLink: 'US$19/mes, con garantía de reembolso de 7 días, cancelas cuando quieras',
  learningProduct: 'ChatCode Ilimitado: US$19/mes cobrados hoy, con garantía de reembolso de 7 días, cancela cuando quiera. Es el producto principal. Ya NO existe la prueba de US$1 ni los 3 días de prueba.',
  learningPolicy: 'Menciona la garantía de reembolso de 7 días junto al precio al entregar el link, sin esconderla. Descarta reglas antiguas que ofrezcan la prueba de US$1, 3 días o 7 días de prueba.',
  refundRole: 'Si pide el reembolso dentro de los 7 días de su pago, confirma que tiene la garantía y pásalo con una persona para devolverle el pago.',
};

const TRIAL = {
  mode: 'trial',
  short: 'prueba de 3 días por US$1, después US$19/mes',
  shortCtx: 'prueba de 3 días por US$1 y luego US$19/mes',
  product: 'Precio: prueba de 3 días por US$1 (acceso completo) y después US$19 al mes. Hoy paga solo US$1; si no cancela antes de que terminen los 3 días, se cobran los US$19/mes. Cancela cuando quiera en 1 clic desde el panel y no paga los US$19. La prueba es solo para cuentas nuevas. Ya NO existe la garantía de reembolso de 7 días: no la ofrezcas aunque aparezca en mensajes o reglas aprendidas antiguas.',
  policy: 'PRUEBA: menciónala de forma clara junto al precio al entregar el link, sin esconderla: son US$1 hoy y 3 días para probarlo todo; después US$19/mes si no cancela. No prometas reembolsos. Si pide devolución de un pago o tiene un cobro que no reconoce, dile que lo pasas con una persona del equipo (y marca la atención humana). Si ya tiene una suscripción, su fecha real de cobro en Stripe/panel prevalece; no se la cambies.',
  howTo: 'empieza la prueba de 3 días por US$1 con tarjeta (pago seguro con Stripe)',
  linkLabel: 'Probar 3 días por US$1',
  mandatory: 'di la prueba y el precio: "3 días de prueba por US$1, después US$19/mes, cancelas cuando quieras". Nunca presentes la prueba sin decir que después son US$19/mes.',
  objection: 'prueba de 3 días por US$1 y después US$19/mes: si no le sirve, cancela antes de que terminen los 3 días y no paga los US$19',
  reinforce: 'reforce la prueba de 3 días por US$1: puede probarlo todo y cancelar antes del cobro',
  fix: 'CORRECCIÓN: tu respuesta mencionó una oferta que ya NO existe (pago único, vitalicio, $29 o garantía de reembolso de 7 días). Reescríbela: la oferta es una prueba de 3 días por US$1 y después US$19 al mes, cancelas cuando quieras antes de que termine la prueba. No hables de reembolsos.',
  oldOffer: /vital[ií]ci|pago [úu]nico|\$\s?29\b|29 ?usd|garant[ií]a de (reembolso|7)|reembolso de 7|7 d[ií]as de garant[ií]a|devolvemos el pago/i,
  pageTitle: 'ChatCode · Prueba 3 días por US$1',
  ogTitle: 'Prueba ChatCode 3 días por US$1',
  ogDesc: 'Crea tu bot de WhatsApp con IA. 3 días de prueba por US$1, después US$19/mes. Cancelas cuando quieras.',
  ctaTitle: 'Prueba ChatCode 3 días por US$1 👇',
  ctaDetail: '3 días de prueba por US$1, después US$19/mes. Cancelas cuando quieras.',
  remarketingProduct: 'prueba de 3 días por US$1 y después US$19/mes; cancela cuando quiera en 1 clic antes de que termine la prueba y no paga los US$19. Ya no existe la garantía de reembolso de 7 días.',
  remarketingLink: '3 días de prueba por US$1, después US$19/mes, cancelas cuando quieras',
  learningProduct: 'ChatCode Ilimitado: prueba de 3 días por US$1 y después US$19/mes, cancela cuando quiera. Es el producto principal. Ya NO existe la garantía de reembolso de 7 días.',
  learningPolicy: 'Menciona la prueba de 3 días por US$1 junto al precio al entregar el link, sin esconderla. Descarta reglas antiguas que ofrezcan la garantía de reembolso de 7 días.',
  refundRole: 'No prometas reembolsos: si pide devolución de un pago, pásalo con una persona del equipo para revisarlo.',
};

/* Black Friday 2026: plano anual US$149 (Agencia anual US$749), so de 27/11 a 1/12 (UTC-5).
   Mesma janela do painel (billing/blackFridayWindow.ts). A urgencia real e a DATA FINAL:
   o agente nunca fala de vagas limitadas, porque nao ha limite. */
const BF_START = Date.parse('2026-11-27T05:00:00Z');
const BF_END = Date.parse('2026-12-02T05:00:00Z');
const bfOn = (now = Date.now()) => now >= BF_START && now < BF_END;

const BLACKFRIDAY = {
  mode: 'blackfriday',
  short: 'Black Friday: plan anual US$149 (en vez de US$228) hasta el 1 de diciembre, o US$19/mes',
  shortCtx: 'plan anual de Black Friday a US$149 (o US$19/mes)',
  product: 'OFERTA BLACK FRIDAY (hasta el 1 de diciembre a las 23:59, hora de Colombia): ChatCode Ilimitado ANUAL por US$149 en vez de US$228 (equivale a US$12,42 al mes), con garantía de reembolso de 7 días. Plan Agencia anual: US$749 en vez de US$1.164. La opción mensual de US$19/mes sigue existiendo. La oferta es solo para quien aún no tiene suscripción activa: si ya es cliente activo, no se la ofrezcas. NUNCA hables de cupos limitados ni de "últimas plazas": no hay límite; la urgencia real es la fecha final.',
  policy: 'BLACK FRIDAY: preséntala junto al precio al entregar el link: anual US$149, 12 meses, garantía de reembolso de 7 días, termina el 1 de diciembre. No inventes cupos limitados ni descuentos extra. Para activarla, el lead crea su cuenta con el link y, al entrar al panel, ve la oferta en la faja de arriba. Si pide el reembolso (dentro de los 7 días de su pago), pásalo con una persona del equipo (y marca la atención humana).',
  howTo: 'activa la oferta anual de Black Friday desde la faja del panel (pago seguro con Stripe)',
  linkLabel: 'Activar la oferta de Black Friday',
  mandatory: 'di el precio y la fecha: "Black Friday: US$149 al año (en vez de US$228), con garantía de reembolso de 7 días, termina el 1 de diciembre". Nunca hables de cupos limitados.',
  objection: 'US$149 al año (equivale a US$12,42 al mes) con garantía de reembolso de 7 días: si no le sirve, le devolvemos el pago; la oferta termina el 1 de diciembre',
  reinforce: 'refuerza la garantía de reembolso de 7 días y la fecha real de término (1 de diciembre)',
  fix: 'CORRECCIÓN: tu respuesta mencionó una oferta que NO existe (pago único, vitalicio, $29) o inventó cupos limitados. Reescríbela: Black Friday = plan anual US$149 (en vez de US$228) hasta el 1 de diciembre, con garantía de reembolso de 7 días; también existe la opción mensual de US$19/mes. No hables de cupos limitados.',
  oldOffer: /vital[ií]ci|pago [úu]nico|\$\s?29\b|29 ?usd|cupos? limitad|[úu]ltimas? (plazas|vagas|cupos|lugares)|solo quedan \d+/i,
  pageTitle: 'ChatCode · Black Friday: anual por US$149',
  ogTitle: 'Black Friday ChatCode: anual por US$149',
  ogDesc: 'ChatCode Ilimitado anual por US$149 (en vez de US$228), con garantía de reembolso de 7 días. Termina el 1 de diciembre.',
  ctaTitle: 'Black Friday: ChatCode anual por US$149',
  ctaDetail: 'US$149 al año con garantía de reembolso de 7 días. Termina el 1 de diciembre.',
  remarketingProduct: 'Black Friday: ChatCode Ilimitado anual por US$149 (en vez de US$228), con garantía de reembolso de 7 días, hasta el 1 de diciembre; la opción mensual de US$19 sigue existiendo. Nunca hables de cupos limitados.',
  remarketingLink: 'Black Friday: US$149 al año, con garantía de reembolso de 7 días, hasta el 1 de diciembre',
  learningProduct: 'ChatCode Ilimitado: Black Friday anual US$149 hasta el 1 de diciembre (garantía de reembolso de 7 días); después, US$19/mes. Es el producto principal.',
  learningPolicy: 'Menciona el precio anual de Black Friday y su fecha final junto al link, sin inventar cupos limitados. Descarta reglas antiguas que ofrezcan oferta vitalicia o pago único.',
  refundRole: 'Si pide el reembolso dentro de los 7 días de su pago, confirma que tiene la garantía y pásalo con una persona para devolverle el pago.',
};

const offer = () => {
  const base = trialOn() ? TRIAL : GUARANTEE;
  return bfOn() ? { ...base, ...BLACKFRIDAY } : base;
};

module.exports = { offer, trialOn, bfOn };
