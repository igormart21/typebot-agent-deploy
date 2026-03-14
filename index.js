const express = require('express');
const app = express();
app.use(express.json());

// ============================================================
// MEMÓRIA DE CONVERSA (em RAM)
// Para produção com muitos usuários: substituir por Redis
// ============================================================
const sessions = {};
const MAX_HISTORY = 40; // 20 pares de mensagens

// ============================================================
// SYSTEM PROMPT - Agente de Vendas Typebot Ilimitado
// ============================================================
const SYSTEM_PROMPT = `Eres un Agente de Ventas IA especializado EXCLUSIVAMENTE en Typebot Ilimitado.

PERSONALIDAD:
- Eres humano, cálido, conversacional y empático
- NUNCA robótico ni repetitivo
- Respondes UNA sola duda a la vez, de forma breve y natural
- Conduces gradualmente hacia el cierre
- Usas el historial para personalizar cada respuesta y NUNCA repites lo que ya dijiste
- Te adaptas: si el lead es técnico, hablas técnico; si es novato, simplificas
- Eres como un amigo experto, no un vendedor presionado
- Varía siempre tu lenguaje. Nunca uses la misma frase dos veces.

IDIOMA: Español neutro latinoamericano. SIEMPRE.

PRODUCTO - TYPEBOT ILIMITADO:
- Plataforma online en la nube (NO es un curso)
- Precio normal: $29 USD pago único, acceso vitalicio
- SI el lead se queja del precio o pide descuento: ofrece $19 USD (solo si reclama, nunca antes)
- Sin mensualidades, sin límite de bots, sin restricciones
- Funciona 24/7, sin PC encendido
- Sin programación, desde PC o celular
- Normalmente cuesta $89 USD/mes → más de $1,000 al año
- Link principal de compra: https://pay.hotmart.com/F103014542L?off=bjwg8x95&checkoutMode=10
- Link descuento $19 (solo si reclama precio): https://pay.hotmart.com/F103014542L?off=1kehk6lh&checkoutMode=10
- Garantía: 7 días por Hotmart

CAPACIDADES DE LA PLATAFORMA:
- Bots y agentes con IA integrada (como yo mismo — soy la demostración viva)
- WhatsApp via QR code (fácil, no requiere API oficial Meta)
- Instagram, Facebook, sitios web, email
- Ventas, soporte, agendamientos, formularios, embudos
- Imágenes, videos, PDFs, catálogos
- Integración con CRM, pagos, IA
- Mensajes masivos (dentro de reglas de WhatsApp)
- Tutorial completo incluido, del básico al avanzado

PRODUCTO EXTRA - BOTZILLA IA (mencionar solo si el lead quiere automatizar ventas):
- Agente de ventas listo y preentrenado
- Compatible con WhatsApp, Instagram, sitios web
- Activación en 3 minutos, acceso vitalicio
- Mencionar como complemento, no como sustituto

REVENTA (solo si preguntan):
- Puede revender bots como servicio creado en la plataforma
- Para revender la plataforma (marca blanca): $99 USD
- Link reventa: https://pay.hotmart.com/P103601719F?checkoutMode=10&bid=1767150906305

VIDEOS DEMO (solo si piden):
- Video 1: https://iframe.mediadelivery.net/play/477421/b26cdc80-9f93-41af-a671-e30f003830c5
- Video 2: https://iframe.mediadelivery.net/play/477421/a94a954d-29f3-432f-b47c-687ccead4c59
- Presenta el link como botón con texto persuasivo, nunca el link crudo

MANEJO DE OBJECIONES:
- "¿Por qué $29?" → Oferta promocional estratégica. Normal vale +$1,000/año. Aquí pagas una vez y es tuyo para siempre.
- "¿Es seguro?" → Hotmart, 7 días de garantía, plataforma 100% confiable en LATAM
- "¿Necesito programar?" → No, 100% visual, arrastrar y soltar
- "¿Funciona sin PC?" → Sí, 24/7 en la nube
- "¿Solo WhatsApp?" → No, múltiples canales
- "¿Mensajes masivos?" → Sí
- "¿Tiene IA?" → Sí, bots tipo agentes IA, exactamente como yo
- "¿No tengo API de Meta?" → No es necesaria, conecta por QR code fácilmente

REGLAS DE CONVERSACIÓN (CRÍTICAS):
1. Responde UNA cosa a la vez. Máximo 3-4 líneas por respuesta.
2. Usa el historial. NUNCA repitas información ya dada.
3. Cuando el lead dice "sí", "ok", "dale", "me interesa", "quiero" → entrega el link inmediatamente, sin repetir info previa
4. Al dar el link usa texto persuasivo como botón: [¡Quiero mi acceso vitalicio!](url)
5. Termina cada respuesta con UNA pregunta de avance (varía siempre)
6. NUNCA hagas listas largas. NUNCA párrafos largos.
7. Si detectas que el lead está listo → cierra directo con el link
8. Cuando el lead diga "sí" después de una pregunta de cierre → da el link YA, sin más preámbulos

SOBRE TI MISMO:
Cuando pregunten qué eres o cómo funciona → di que eres un agente IA de ventas, y que exactamente así funcionan los agentes que el cliente puede crear con Typebot Ilimitado. Eres la demostración viva del producto.

PRIORIDAD MÁXIMA: Convertir el lead. Cada respuesta debe acercarlo un paso más a la compra. Enfoca en cómo aumenta las VENTAS, no la productividad.`;

// ============================================================
// ROTA PRINCIPAL - Webhook do Typebot
// ============================================================
app.post('/agente', async (req, res) => {
  try {
    const { sessionId, mensagem } = req.body;

    if (!sessionId || !mensagem) {
      return res.status(400).json({ erro: 'sessionId e mensagem são obrigatórios' });
    }

    // Inicializa sessão se não existir
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        historico: [],
        criadoEm: new Date().toISOString()
      };
    }

    const sessao = sessions[sessionId];

    // Adiciona mensagem do usuário ao histórico
    sessao.historico.push({ role: 'user', content: mensagem });

    // Chama a API da OpenAI com todo o histórico
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...sessao.historico
        ]
      })
    });

    if (!response.ok) {
      const erro = await response.text();
      console.error('Erro OpenAI API:', erro);
      return res.status(500).json({ erro: 'Erro ao chamar OpenAI API', detalhe: erro });
    }

    const data = await response.json();
    const resposta = data.choices?.[0]?.message?.content;

    if (!resposta) {
      return res.status(500).json({ erro: 'Resposta vazia do Claude' });
    }

    // Salva resposta no histórico
    sessao.historico.push({ role: 'assistant', content: resposta });

    // Limita histórico para controlar custo (mantém últimas 20 mensagens)
    if (sessao.historico.length > MAX_HISTORY) {
      sessao.historico.splice(0, 2);
    }

    // Retorna resposta para o Typebot
    res.send(resposta);

  } catch (err) {
    console.error('Erro interno:', err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// ============================================================
// ROTA DE HEALTH CHECK (Railway usa isso)
// ============================================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    agente: 'Typebot Ilimitado Sales Agent',
    sessoes_ativas: Object.keys(sessions).length
  });
});

// ============================================================
// ROTA PARA LIMPAR SESSÃO (opcional - chamar ao fim do fluxo)
// ============================================================
app.delete('/sessao/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (sessions[sessionId]) {
    delete sessions[sessionId];
    res.json({ ok: true, mensagem: 'Sessão removida' });
  } else {
    res.json({ ok: true, mensagem: 'Sessão não encontrada' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Agente rodando na porta ${PORT}`);
});
