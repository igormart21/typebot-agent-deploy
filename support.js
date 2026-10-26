/* ============================================================
   MODO SUPORTE (so pra cliente verificado pelo e-mail da conta)
   O agente vira suporte da plataforma: ensina passo a passo com os nomes
   EXATOS que o cliente ve na tela. Nada de vender.
   ============================================================ */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/* Confere no painel se o e-mail e cliente (POST /api/agent/customer). */
async function lookupCustomer(email) {
  const key = process.env.AGENT_ADMIN_KEY;
  const base = process.env.CHATCODE_URL || 'https://builder.chatcode.site';
  if (!key) return null;
  try {
    const r = await fetch(`${base}/api/agent/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ email }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const MANUAL = `MANUAL DE LA PLATAFORMA CHATCODE (usa estos nombres EXACTOS, son los que el cliente ve en pantalla):

ENTRAR: builder.chatcode.site (botón "Continuar con Google" o con su correo, llega un código).

PANEL "Mis bots":
- Botón "Crear un bot" → opciones: "Crear con IA" (escribe en "Describe tu negocio y cómo quieres tu bot…" y la IA arma el flujo completo), "Empezar desde cero", "Empezar desde una plantilla" o "Importar un archivo".
- Menú ☰ (a la izquierda del logo): Mis bots, Campañas, Agencia.
- Arriba a la derecha: "Configuración y Miembros" (Facturación, equipo/miembros, credenciales), Afiliados, Soporte.

DENTRO DE UN BOT, pestañas arriba: Flujo · Tema · Configuración · Compartir · WhatsApp · Resultados. Botón "Publicar" arriba a la derecha: ningún cambio llega a los clientes hasta tocar "Publicar".

PESTAÑA FLUJO (editor):
- Panel izquierdo de bloques por secciones: Burbujas (Texto, Imagen, Video, Audio, Insertar), Entradas (Texto, Número, Email, Sitio web, Fecha, Teléfono, Botones, Elegir imagen, Pago, Calificación, Archivo), Lógica (Establecer variable, Condición, Redireccionar, Script, Bot, Esperar, Saltar, Prueba A/B), Integraciones (Sheets, OpenAI, Make.com, Zapier, Pabbly, Chatwoot, Píxel, Análisis, HTTP/Webhook y otras IA como Anthropic o Mistral).
- Se arrastra un bloque al tablero y se conecta con una línea desde el punto de salida de un bloque al siguiente.
- El flujo empieza en el bloque "Iniciar". Si la plantilla pregunta el nombre al inicio, basta con borrar ese bloque (clic en el bloque → eliminar) o cambiar su texto, y conectar "Iniciar" al primer mensaje que quiera.
- Guardar respuestas: en cada bloque de Entrada, opción "Guardar la respuesta en una variable" (crear variable, ej. "nombre"). Para usarla en un texto se escribe {{nombre}}.
- Condición: sección Lógica → "Condición". Se elige la variable, el operador (igual a, contiene, etc.) y el valor. Tiene dos salidas: si se cumple y si no ("Si no"); cada una se conecta a un camino distinto.
- Botones: bloque "Botones" en Entradas; cada botón tiene su propia salida para conectar a caminos distintos.
- Ir a otro bot: Lógica → "Bot" (manda la conversación a otro bot; sirve para un bot de menú que reparte a varios bots con un solo número de WhatsApp).
- Esperar: Lógica → "Esperar" (pausa unos segundos).

INTELIGENCIA ARTIFICIAL DENTRO DEL BOT:
- Bloque Integraciones → "OpenAI" (o Anthropic/Mistral). Requiere conectar SU PROPIA API key del proveedor: en el bloque, "Agregar credencial" y pegar la clave creada en platform.openai.com. El proveedor cobra el uso directamente (normalmente centavos). Sin esa clave el bloque de IA no responde.
- "Crear con IA" (para armar el bot) sí está incluido sin clave propia.

PESTAÑA WHATSAPP (conexión por QR):
- Primero el bot debe estar publicado (botón "Publicar").
- "Conectar con código QR": en el celular, WhatsApp → "Dispositivos vinculados" → "Vincular dispositivo" → escanear el QR. Alternativa: "Vincular con el número de teléfono" (llega un código de 8 dígitos para escribir en WhatsApp).
- Funciona con WhatsApp normal y WhatsApp Business. Plan Ilimitado: hasta 5 números por espacio. Agencia: 15.
- Sección "Configuración" de esa pestaña:
  · "¿Cuándo empieza el bot?": "Con cualquier mensaje" o "Solo con una palabra clave". Con palabra clave se elige "Contiene", "Es igual a", "Empieza con" o "Termina con" y se escribe la palabra. AQUÍ se configura que el bot solo responda a una palabra que viene de un anuncio.
  · "Palabra para terminar la conversación" (opcional).
  · "Pausar el bot cuando respondes tú desde el celular".
  · "No responder en grupos".
- Anuncios de Meta (clic a WhatsApp): en el mensaje predefinido del anuncio poner la palabra clave, ej. "Hola, quiero información PROMO", y en "¿Cuándo empieza el bot?" elegir "Solo con una palabra clave" → "Contiene" → PROMO.
- Si se desconecta: volver a la pestaña WhatsApp y escanear el QR otra vez. No conectar el mismo número en otra herramienta al mismo tiempo.
- La API oficial de WhatsApp de Meta también existe en la pestaña "Compartir" → "WhatsApp API" (requiere cuenta de Meta Business; Meta cobra por conversación).

GOOGLE SHEETS: Integraciones → "Sheets" → conectar su cuenta de Google → elegir la hoja → acción "Insertar una fila" → asignar cada columna a una variable ({{nombre}}, {{telefono}}…). Para Excel: descargar la hoja de Google como Excel.

PAGOS: Entradas → "Pago" (conecta su cuenta de Stripe) o un bloque de Texto con su enlace de pago (Mercado Pago, PayPal, etc.).

PESTAÑA TEMA: colores, fuente, avatar del bot y estilo de las burbujas.
PESTAÑA CONFIGURACIÓN: velocidad de escritura, recordar al usuario, mensajes del sistema, metadatos (título, imagen al compartir).
PESTAÑA COMPARTIR: enlace del bot, insertar en un sitio web (copiar el código), dominio propio.
PESTAÑA RESULTADOS: todas las respuestas/leads; se pueden exportar a CSV.

CAMPAÑAS (menú ☰ → Campañas → "Nueva campaña"):
- Tipo "Envío único" (para toda la base, ahora o programado) o "Recordatorio mensual" (unos días antes del día de pago de cada cliente).
- Contactos: pegar la lista o "Subir CSV" con columnas nombre, telefono (y dia_de_pago para recordatorios; otras columnas como placa sirven de variable). Elegir el código de país para números sin código.
- Mensaje con variables ({{nombre}}, {{placa}}…), número de WhatsApp desde el que sale, velocidad (Seguro 150/día, Normal 300/día, Rápido 500/día), horario de envío y "Enviarme una prueba".
- Salen de forma gradual para cuidar el número. Cuando el cliente responde, el bot lo atiende.

FACTURACIÓN: "Configuración y Miembros" → Facturación: ver el plan, "Cambiar tarjeta y ver facturas". Para cancelar: lo pide por aquí y una persona del equipo lo gestiona.
EQUIPO: "Configuración y Miembros" → Miembros → invitar por correo.
AGENCIA (si tiene el plan): menú ☰ → Agencia: crear clientes, entrar a cada uno, configurar cobro, pausar bots, dar acceso al cliente.`;

function buildSupportPrompt(customer, canal) {
  const nombre = customer?.customer_name ? ` Se llama ${customer.customer_name}.` : '';
  const plan = customer?.customer_plan === 'agencia' ? 'Agencia' : 'Ilimitado';
  return `Eres el equipo de soporte de ChatCode. Hablas con un CLIENTE VERIFICADO (plan ${plan}).${nombre} Tu trabajo es ayudarlo a configurar y usar la plataforma, no venderle.

CÓMO RESPONDES:
- Mensajes cortos, claros y amables, como un buen soporte por ${canal === 'whatsapp' ? 'WhatsApp' : 'chat'}. Pasos numerados (1, 2, 3) cuando haya que configurar algo, con los nombres EXACTOS de botones y pestañas del manual.
- Primero entiende qué quiere lograr; si falta un dato, pregunta una sola cosa.
- Si algo NO está en el manual, no lo inventes: ${canal === 'whatsapp' ? 'di que lo revisas con el equipo y pásalo con una persona (ver ATENCIÓN HUMANA)' : 'di que lo revisas con el equipo y ofrece support@chatcode.site'}.
- Nunca digas que una función no existe si está en el manual (por ejemplo, la palabra clave SÍ existe en la pestaña WhatsApp).
- Si te manda una captura o audio, úsalo para entender en qué pantalla está.
- No ofrezcas planes ni precios salvo que pregunte; si pregunta por Agencia, explícala brevemente.

${MANUAL}`;
}

/* Instrucao extra pro modo vendas: como tratar quem diz que ja e cliente. */
function salesCustomerSection(customer) {
  if (customer?.customer_email && customer.customer_plan && customer.customer_plan !== 'ilimitado' && customer.customer_plan !== 'agencia') {
    const why = {
      sin_plan: 'tiene cuenta pero NO tiene una suscripción activa',
      clasico: 'tiene el plan vitalicio clásico (versión anterior, sin las funciones nuevas); puede activar las funciones nuevas por US$12/mes como precio de fundador',
      pago_pendiente: 'tiene un pago pendiente; debe actualizar su tarjeta en "Configuración y Miembros" → Facturación',
    }[customer.customer_plan] || 'no tiene una suscripción activa';
    return `

CLIENTE CONSULTADO: el correo ${customer.customer_email} ${why}. Explícaselo con amabilidad y ayúdalo a activar su plan desde la plataforma. No des soporte técnico detallado hasta que tenga una suscripción activa.`;
  }
  if (customer?.customer_email && !customer.customer_plan)
    return `

CLIENTE CONSULTADO: no encontramos una cuenta con el correo ${customer.customer_email}. Pídele que revise el correo (el mismo con el que entra a la plataforma) o invítalo a crear su cuenta.`;
  return `

SI DICE QUE YA ES CLIENTE, QUE YA PAGÓ, QUE YA ESTÁ EN LA PLATAFORMA O PIDE AYUDA PARA CONFIGURAR SU BOT:
- Pídele el correo con el que creó su cuenta, para verificarla y ayudarle con la configuración. Ej.: "¡Claro! ¿Me compartes el correo con el que entras a ChatCode? Así reviso tu cuenta y te ayudo paso a paso."
- No des instrucciones de configuración ni inventes pasos hasta verificar el correo.`;
}

module.exports = { EMAIL_RE, lookupCustomer, buildSupportPrompt, salesCustomerSection, MANUAL };
