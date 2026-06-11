/**
 * Presets de outreach para mercado USA-Hispano.
 *
 * Estos son los textos que el equipo usa al hacer outreach manual o masivo
 * a prospectos extraídos del scraper de Google Maps.
 *
 * Convención de variables:
 *   {{nombre}}    — nombre del contacto o del negocio
 *   {{negocio}}   — nombre del negocio (si distinto)
 *   {{ciudad}}    — ciudad / metro
 *   {{vertical}}  — "taller", "landscaping", "cleaning service", etc.
 *   {{landing}}   — URL de la landing vertical correspondiente
 *   {{link_pago}} — URL de checkout/pago que el operador inyecta al cerrar
 *
 * Para WhatsApp Cloud API templates aprobadas por Meta, el orden de
 * sustitución corresponde a {{1}}, {{2}}, ... — usa `renderPreset()` o
 * `presetToBodyVars()`.
 */

import { INDEXA_SITE_URL } from "./seoSchemas";

export type OutreachVertical =
  | "mecanicos"
  | "landscaping"
  | "limpieza"
  | "construccion"
  | "plomeros"
  | "restaurantes"
  | "generico";

export type OutreachStage =
  | "cold_opener_text"
  | "cold_opener_audio_script"
  | "post_audit_followup"
  | "no_reply_followup_2d"
  | "no_reply_followup_5d"
  | "no_reply_followup_10d"
  | "objection_price"
  | "objection_busy"
  | "objection_already_agency"
  | "objection_no_time"
  | "objection_think"
  | "close_call_invite"
  | "close_payment_link";

export interface OutreachPreset {
  id: string;
  stage: OutreachStage;
  vertical: OutreachVertical;
  /**
   * Tipo de delivery sugerido. "audio" implica que el texto es el GUION para
   * grabar — no se manda como texto, se manda como nota de voz.
   */
  delivery: "text" | "audio";
  body: string;
  /**
   * Variables que el texto requiere. Si faltan en runtime, `renderPreset` las
   * deja como `{{nombre}}` literal y se debe completar manualmente antes de enviar.
   */
  vars: string[];
  /**
   * Versión del copy. "v1" = auditoría-first (legacy). "v2" = híbrido AIDA:
   * dolor cuantificado + mensualidad CON garantía de 30 días + CTA "Responde SÍ".
   * Sin valor = v1. Sirve para comparar respuesta por versión en outreach_metrics.
   */
  version?: "v1" | "v2";
  /**
   * Template de Meta aprobado equivalente a este preset, para envío automático
   * fuera de la ventana de 24h. El ORDEN de variables del template debe
   * coincidir con `vars` (presetToBodyVars mapea en orden a {{1}}, {{2}}...).
   */
  metaTemplateName?: string;
  metaTemplateLang?: string;
}

const verticalLandingMap: Record<OutreachVertical, string> = {
  mecanicos: "/mecanicos-usa",
  landscaping: "/landscaping-usa",
  limpieza: "/limpieza-usa",
  construccion: "/construccion-usa",
  plomeros: "/plomeros-usa",
  restaurantes: "/usa",
  generico: "/usa",
};

const verticalLabel: Record<OutreachVertical, string> = {
  mecanicos: "taller",
  landscaping: "negocio de landscaping",
  limpieza: "cleaning service",
  construccion: "negocio de construcción",
  plomeros: "negocio de plomería",
  restaurantes: "restaurante",
  generico: "negocio",
};

export const OUTREACH_PRESETS_USA: OutreachPreset[] = [
  // -------------------- COLD OPENER (audio) --------------------
  {
    id: "cold_audio_v1",
    stage: "cold_opener_audio_script",
    vertical: "generico",
    delivery: "audio",
    vars: ["nombre", "negocio", "ciudad"],
    body: `Buenas {{nombre}}, te habla [tu nombre] de INDEXA. Vi que tienes el {{negocio}} ahí en {{ciudad}} — vimos tu perfil de Google y la verdad se ve que mueves bien, pero te están faltando un par de cosas en línea que te están haciendo perder clientes que te están buscando ahora mismo. Hacemos publicidad en español y en inglés para negocios como el tuyo. Si tienes 5 minutos te puedo mandar una auditoría gratis donde te muestro qué te falta y cuántos clientes estás perdiendo cada mes. ¿Te la mando?`,
  },
  {
    id: "cold_audio_mecanicos",
    stage: "cold_opener_audio_script",
    vertical: "mecanicos",
    delivery: "audio",
    vars: ["nombre", "negocio", "ciudad"],
    body: `Buenas {{nombre}}, te habla [tu nombre] de INDEXA. Vi tu taller {{negocio}} ahí en {{ciudad}} — se ve que mueves buen volumen pero noté que en Google estás apareciendo abajo de competidores que tienen menos reseñas que tú. Eso te está costando 20 a 40 clientes al mes. Trabajo con talleres hispanos en USA llenándoles la agenda con anuncios en español. Si tienes 5 minutos te mando una auditoría gratis con números reales. ¿Te la mando?`,
  },
  {
    id: "cold_audio_landscaping",
    stage: "cold_opener_audio_script",
    vertical: "landscaping",
    delivery: "audio",
    vars: ["nombre", "negocio", "ciudad"],
    body: `Buenas {{nombre}}, te habla [tu nombre] de INDEXA. Vi tu negocio de landscaping {{negocio}} ahí en {{ciudad}}. Mira, llevamos casi un año trabajando con landscapers hispanos en Houston y Miami llenándoles la agenda con contratos mensuales y proyectos de mulch, sod y diseño. Tu negocio se ve sólido pero noté que no estás capturando ni la mitad de los clientes que te están buscando en Google. Te puedo mandar una auditoría gratis donde te muestro la fuga, sin compromiso. ¿Te la mando?`,
  },

  // -------------------- COLD OPENER (texto, si no hay audio) --------------------
  {
    id: "cold_text_v1",
    stage: "cold_opener_text",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "negocio"],
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Vi que tienes {{negocio}} y trabajamos llenando agendas de negocios hispanos en USA con anuncios en español. ¿Te puedo mandar una auditoría gratis (sin compromiso) donde te muestro cuántos clientes estás perdiendo cada mes? Te la armo en 5 min.`,
  },

  // -------------------- POST AUDITORÍA --------------------
  {
    id: "post_audit_v1",
    stage: "post_audit_followup",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    body: `Perfecto {{nombre}}. Antes de mandarte la auditoría necesito 3 cositas para que sea útil:\n\n1. ¿En qué zona/ZIP estás trabajando ahora?\n2. ¿Cuál es el servicio que más te gustaría llenar?\n3. ¿Cuánto inviertes hoy en publicidad o flyers al mes?\n\nCon eso te mando un video corto de 3-5 min diciéndote qué te está faltando y qué resultado puedes esperar. Sin compromiso.`,
  },

  // -------------------- NO REPLY FOLLOWUPS --------------------
  {
    id: "noreply_d2",
    stage: "no_reply_followup_2d",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    body: `Hola {{nombre}}, ¿alcanzaste a ver el video de la auditoría? Si tienes preguntas dímelas, sin compromiso.`,
  },
  {
    id: "noreply_d5",
    stage: "no_reply_followup_5d",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "ciudad"],
    body: `{{nombre}}, no quiero molestarte. Cierro mi disponibilidad para {{ciudad}} este mes hoy. Si quieres entrar al cupo te lo guardo. Si no, sin problema, te dejo ir.`,
  },
  {
    id: "noreply_d10",
    stage: "no_reply_followup_10d",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    body: `{{nombre}}, última. Vi que un competidor cerca de tu zona acaba de prender una campaña fuerte en Facebook. Ese cliente que ahora va con él era para vos. Si quieres recuperar terreno, dímelo y te paso la captura.`,
  },

  // -------------------- OBJECIONES --------------------
  {
    id: "objection_price",
    stage: "objection_price",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    body: `Te entiendo {{nombre}}. Mira, los $497/mes incluyen setup, página web, anuncios y soporte — y la garantía es que si en 30 días no ves leads no pagas el siguiente mes. Cualquier flyer o magnet que mandes a imprimir te cuesta más y no sabes si te trajo clientes. Esto sí lo medimos. ¿Te animas a probar 1 mes?`,
  },
  {
    id: "objection_busy",
    stage: "objection_busy",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    body: `Perfecto {{nombre}}, justo por eso INDEXA está hecho para ti. El setup lo hacemos nosotros — tú solo respondes los WhatsApps que lleguen. Te toma 2-3 min cerrar cada cliente. ¿Mañana o el miércoles puedes 15 min para arrancar?`,
  },

  // -------------------- INVITE A CIERRE --------------------
  {
    id: "close_call_invite",
    stage: "close_call_invite",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    body: `{{nombre}}, ¿podemos hacer una llamada corta de 15 min por WhatsApp? Te muestro el plan exacto, los números y la garantía. Si no te late, no pasa nada — pero quiero que veas exactamente qué te toca a ti y qué a nosotros. ¿Hoy o mañana te queda mejor?`,
  },

  // ════════════════════ V2 — HÍBRIDO AIDA ════════════════════
  // Estructura: gancho personalizado → dolor cuantificado → mensualidad CON
  // garantía de 30 días ("el riesgo lo corremos nosotros") → CTA "Responde SÍ".

  // -------------------- COLD OPENER V2 (texto) --------------------
  {
    id: "cold_text_v2",
    stage: "cold_opener_text",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_opener_v2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Encontré {{negocio}} en Google Maps y noté algo que te está costando dinero: cuando alguien en {{ciudad}} busca lo que tú ofreces, aparecen primero 2 o 3 competidores — y se quedan con clientes que ya te estaban buscando a ti. Nosotros nos encargamos de todo tu marketing: página web, anuncios en español e inglés, y los clientes te llegan directo al WhatsApp. Son $497 al mes y va con garantía: si en 30 días no ves leads, el mes siguiente va por nuestra cuenta. El riesgo lo corremos nosotros. ¿Te mando una auditoría gratis de 3 minutos para que veas cuántos clientes se te están yendo? Responde SÍ y hoy mismo te la armo.`,
  },
  {
    id: "cold_text_v2_mecanicos",
    stage: "cold_opener_text",
    vertical: "mecanicos",
    delivery: "text",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_opener_v2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Vi tu taller {{negocio}} en Google Maps y noté que apareces abajo de talleres en {{ciudad}} que tienen menos reseñas que tú. ¿Sabes qué significa eso? Entre 20 y 40 carros al mes que te buscaban a ti y terminaron en otro taller. Nosotros nos encargamos de todo el marketing de talleres hispanos: te subimos en Google, corremos tus anuncios en español e inglés, y los clientes te escriben directo al WhatsApp. Son $497 al mes con garantía: si en 30 días no ves clientes nuevos, el mes siguiente va por nuestra cuenta. ¿Te mando una auditoría gratis con los números reales de tu taller? Responde SÍ y te la mando hoy.`,
  },
  {
    id: "cold_text_v2_landscaping",
    stage: "cold_opener_text",
    vertical: "landscaping",
    delivery: "text",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_opener_v2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Vi {{negocio}} en Google Maps y noté que en {{ciudad}} hay gente buscando landscaping cada semana que no te está encontrando — esos contratos mensuales y proyectos de mulch, sod y diseño se los están quedando otros. Trabajamos con landscapers hispanos llenándoles la agenda: página, anuncios en español e inglés, y los clientes te escriben directo al WhatsApp. Son $497 al mes con garantía: si en 30 días no ves leads, el mes siguiente va por nuestra cuenta. ¿Te mando una auditoría gratis para que veas cuántos clientes está dejando ir tu zona? Responde SÍ y hoy te la armo.`,
  },
  {
    id: "cold_text_v2_limpieza",
    stage: "cold_opener_text",
    vertical: "limpieza",
    delivery: "text",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_opener_v2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Vi {{negocio}} en Google Maps y noté que en {{ciudad}} hay familias y oficinas buscando servicio de limpieza cada semana que no te están encontrando — y un solo cliente recurrente de limpieza vale cientos de dólares al año. Nosotros nos encargamos de todo tu marketing: página, anuncios en español e inglés, y los clientes te escriben directo al WhatsApp. Son $497 al mes con garantía: si en 30 días no ves leads, el mes siguiente va por nuestra cuenta. ¿Te mando una auditoría gratis para que veas cuántos clientes se te están yendo? Responde SÍ y hoy te la armo.`,
  },
  {
    id: "cold_text_v2_construccion",
    stage: "cold_opener_text",
    vertical: "construccion",
    delivery: "text",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_opener_v2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Vi {{negocio}} en Google Maps y te lo digo directo: en construcción y remodelación un solo proyecto vale miles de dólares — y ahora mismo hay gente en {{ciudad}} buscando contratista en Google que está terminando con otro porque tú no apareces arriba. Nosotros nos encargamos de tu marketing completo: página que da confianza, anuncios en español e inglés, y los clientes te escriben directo al WhatsApp. Son $497 al mes con garantía: si en 30 días no ves leads, el mes siguiente va por nuestra cuenta. Con que cierres UN proyecto, pagaste el año entero. ¿Te mando una auditoría gratis de tu zona? Responde SÍ y te la mando hoy.`,
  },
  {
    id: "cold_text_v2_plomeros",
    stage: "cold_opener_text",
    vertical: "plomeros",
    delivery: "text",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_opener_v2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, soy [tu nombre] de INDEXA. Vi {{negocio}} en Google Maps y noté algo: cuando a alguien en {{ciudad}} se le rompe una tubería, busca "plomero cerca de mí" y llama al primero que aparece — y ahorita ese primero no eres tú. Cada llamada de emergencia que no te llega son $150 a $500 que se lleva otro. Nosotros nos encargamos de tu marketing completo: página, anuncios en español e inglés, y las llamadas y WhatsApps te llegan directo. Son $497 al mes con garantía: si en 30 días no ves leads, el mes siguiente va por nuestra cuenta. ¿Te mando una auditoría gratis para que veas dónde apareces hoy? Responde SÍ y te la mando.`,
  },

  // -------------------- COLD OPENER V2 (audio) --------------------
  {
    id: "cold_audio_v2",
    stage: "cold_opener_audio_script",
    vertical: "generico",
    delivery: "audio",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    body: `Buenas {{nombre}}, te habla [tu nombre] de INDEXA. Mira, encontré {{negocio}} en Google Maps y por eso te escribo... me tomé 5 minutos para revisar cómo apareces en internet y hay un detalle que te está costando clientes: la gente en {{ciudad}} sí está buscando lo que tú haces, pero le aparecen primero otros negocios. O sea, esos clientes ya eran tuyos y se los está llevando otro. A eso nos dedicamos: nos encargamos de todo tu marketing — tu página, tus anuncios en español y en inglés — y los clientes te caen directito al WhatsApp. Cuesta 497 al mes, y va con una garantía bien clara: si en 30 días no ves leads, el mes que sigue corre por nuestra cuenta. Tú no arriesgas nada. Mándame un SÍ y hoy mismo te paso una auditoría gratis con los números de tu negocio, para que veas con tus propios ojos lo que estás dejando ir.`,
  },
  {
    id: "cold_audio_v2_mecanicos",
    stage: "cold_opener_audio_script",
    vertical: "mecanicos",
    delivery: "audio",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    body: `Buenas {{nombre}}, te habla [tu nombre] de INDEXA. Te cuento rapidito por qué te escribo: vi tu taller {{negocio}} ahí en {{ciudad}} y revisé cómo apareces en Google... y mira, estás abajo de talleres que tienen menos reseñas que tú. Eso en números son 20, 30, hasta 40 carros al mes que te estaban buscando y acabaron con la competencia. Nosotros trabajamos con talleres hispanos en Estados Unidos y nos encargamos de todo: te subimos en Google, te corremos anuncios en español y en inglés, y los clientes te llegan directo al WhatsApp del taller. Son 497 al mes, con garantía de 30 días: si no ves clientes nuevos, el mes que sigue va por nuestra cuenta — así de seguro estamos. Mándame un SÍ y hoy te paso una auditoría gratis con los números de tu taller. Sin compromiso, tú decides después de verla.`,
  },
  {
    id: "cold_audio_v2_landscaping",
    stage: "cold_opener_audio_script",
    vertical: "landscaping",
    delivery: "audio",
    vars: ["nombre", "negocio", "ciudad"],
    version: "v2",
    body: `Buenas {{nombre}}, te habla [tu nombre] de INDEXA. Vi tu negocio {{negocio}} ahí en {{ciudad}} y te escribo porque llevamos tiempo trabajando con landscapers hispanos y conocemos bien el problema: la temporada fuerte se te va en el trabajo del día y el marketing se queda botado... y mientras tanto, la gente de tu zona está buscando landscaping en Google y le aparecen otros. Contratos mensuales, proyectos de mulch, de sod, de diseño — que podían ser tuyos. Nosotros nos encargamos de todo: tu página, tus anuncios en español y en inglés, y los clientes te caen directo al WhatsApp. Son 497 al mes con garantía de 30 días: si no ves leads, el mes siguiente va por nuestra cuenta. Mándame un SÍ y te paso hoy mismo una auditoría gratis de tu zona, para que veas el trabajo que se está yendo. No pierdes nada con verla.`,
  },

  // -------------------- NO REPLY V2 --------------------
  {
    id: "noreply_d2_v2",
    stage: "no_reply_followup_2d",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "negocio"],
    version: "v2",
    metaTemplateName: "indexa_usa_followup_d2",
    metaTemplateLang: "es",
    body: `Hola {{nombre}}, te escribí hace un par de días sobre {{negocio}} y no quiero que se te pierda el mensaje entre tanto trabajo. Te lo resumo en dos líneas: nos encargamos de TODO tu marketing por $497 al mes, y si en 30 días no ves leads, el mes siguiente va por nuestra cuenta — el riesgo es nuestro, no tuyo. La auditoría gratis sigue en pie. ¿Te la mando? Solo responde SÍ.`,
  },
  {
    id: "noreply_d5_v2",
    stage: "no_reply_followup_5d",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "ciudad"],
    version: "v2",
    metaTemplateName: "indexa_usa_followup_d5",
    metaTemplateLang: "es",
    body: `{{nombre}}, te soy honesto: en {{ciudad}} solo trabajamos con un número limitado de negocios por giro — no tiene sentido posicionar a dos competidores en la misma zona. Este mes me quedan 2 espacios y uno lo estoy guardando para ti. Otros negocios hispanos ya están viendo llegar clientes por WhatsApp cada semana con este sistema. Si quieres tu espacio, respóndeme hoy y te lo aparto sin compromiso — la garantía de 30 días sigue en pie. ¿Lo tomas?`,
  },
  {
    id: "noreply_d10_v2",
    stage: "no_reply_followup_10d",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "negocio"],
    version: "v2",
    metaTemplateName: "indexa_usa_followup_d10",
    metaTemplateLang: "es",
    body: `{{nombre}}, esta es la última vez que te escribo, lo prometo. Solo te dejo un dato para que lo pienses: cada mes que {{negocio}} no aparece arriba en Google, tus competidores se quedan con clientes que ya te estaban buscando a ti. Eso no se recupera — pero sí se puede detener. Cuando estés listo, respóndeme y armamos tu plan ese mismo día, con la garantía de 30 días incluida. Mientras tanto, mucho éxito con el negocio.`,
  },

  // -------------------- OBJECIONES V2 --------------------
  {
    id: "objection_price_v2",
    stage: "objection_price",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    version: "v2",
    body: `Te entiendo {{nombre}}, $497 suena fuerte hasta que lo partes: son como $16 al día — menos de lo que se va en flyers que nadie mide. Aquí entra todo: tu página, tus anuncios en español e inglés, y un reporte mensual con cuántos clientes te trajimos, con números. Y la garantía te protege: si en 30 días no ves leads, el mes siguiente no lo pagas. Dime una cosa: ¿cuánto te deja un cliente promedio? Porque con que cierres uno o dos al mes, esto ya se pagó solo.`,
  },
  {
    id: "objection_already_agency",
    stage: "objection_already_agency",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    version: "v2",
    body: `Qué bueno {{nombre}}, eso habla bien de ti — ya estás invirtiendo en crecer. Solo una pregunta honesta: ¿te dicen cada mes cuántos clientes te trajeron, con números que puedas ver? Nosotros sí: cada mes te llega tu reporte con visitas, contactos y leads. Si tu proveedor actual te da resultados claros, quédate con él, en serio. Pero si nada más te cobran y no sabes qué estás recibiendo, déjame hacerte una auditoría gratis comparando lo que tienes contra lo que deberías estar viendo. Sin compromiso y sin que dejes a nadie todavía. ¿Te la mando?`,
  },
  {
    id: "objection_no_time",
    stage: "objection_no_time",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    version: "v2",
    body: `Justo por eso existe INDEXA, {{nombre}}. Tú no tienes que hacer NADA: nosotros armamos la página, prendemos los anuncios y te mandamos los reportes. Lo único que haces tú es contestar los WhatsApps de clientes nuevos — eso sí no te lo podemos quitar. Para arrancar solo necesito 15 minutos tuyos, una sola vez. ¿Cuándo te queda mejor: mañana en la mañana o en la tarde?`,
  },
  {
    id: "objection_think",
    stage: "objection_think",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    version: "v2",
    body: `Claro {{nombre}}, tómate tu tiempo — es tu negocio y la decisión importa. Solo te dejo esto para pensarlo con calma: la garantía hace que el riesgo sea nuestro, no tuyo. Si en 30 días no ves leads, el mes siguiente va por nuestra cuenta. O sea, lo peor que puede pasar es que pruebes un mes y decidas que no. Y dime con confianza: ¿qué es lo que te detiene — el precio, el tiempo, o quieres ver resultados de otros negocios? Te respondo directo, sin rodeos.`,
  },

  // -------------------- CIERRE V2 --------------------
  {
    id: "close_payment_link",
    stage: "close_payment_link",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre", "link_pago"],
    version: "v2",
    body: `¡Vamos a hacerlo, {{nombre}}! Aquí está tu link para activar el plan: {{link_pago}} — en cuanto se procese el pago, en 48 horas tienes tu página lista y empezamos con tus anuncios. Y recuerda lo acordado: 30 días de garantía — si no ves leads, el mes 2 va por nuestra cuenta. Si te aparece cualquier duda al momento de pagar, me escribes aquí mismo y te acompaño en el proceso. Bienvenido a INDEXA.`,
  },
  {
    id: "close_call_invite_v2",
    stage: "close_call_invite",
    vertical: "generico",
    delivery: "text",
    vars: ["nombre"],
    version: "v2",
    body: `{{nombre}}, ¿te parece una llamada corta de 15 minutos por WhatsApp? Te muestro el plan exacto para tu negocio, los números que puedes esperar y cómo funciona la garantía de 30 días. Si al final no te late, no pasa nada — pero al menos vas a saber exactamente qué estás dejando en la mesa. ¿Hoy en la tarde o mañana?`,
  },
];

/**
 * Sustituye variables tipo {{nombre}} en el preset.
 * Las variables que no se proveen se dejan literales — el operador las
 * completa manualmente antes de enviar.
 */
export function renderPreset(
  preset: OutreachPreset,
  vars: Partial<Record<string, string>>
): string {
  let out = preset.body;
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value !== "string" || !value) continue;
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

/**
 * Construye URL completa de la landing del vertical para enriquecer mensajes
 * que mencionen un link.
 */
export function getVerticalLanding(vertical: OutreachVertical): string {
  return `${INDEXA_SITE_URL}${verticalLandingMap[vertical]}`;
}

/**
 * Para WhatsApp Cloud API templates aprobadas, Meta sustituye {{1}}, {{2}}...
 * en orden. Convertir un preset a array de variables en el orden esperado.
 *
 * @example
 *   const p = OUTREACH_PRESETS_USA.find(p => p.id === "cold_text_v1")!;
 *   const vars = presetToBodyVars(p, { nombre: "Carlos", negocio: "Taller Méndez" });
 *   // vars = ["Carlos", "Taller Méndez"]
 */
export function presetToBodyVars(
  preset: OutreachPreset,
  vars: Partial<Record<string, string>>
): string[] {
  return preset.vars.map((v) => vars[v] || `{{${v}}}`);
}

/**
 * Filtra presets aplicables a un vertical específico, cayendo a "generico"
 * si no hay preset dedicado para ese vertical y stage.
 */
export function getPresetsForVertical(
  vertical: OutreachVertical
): OutreachPreset[] {
  const dedicated = OUTREACH_PRESETS_USA.filter((p) => p.vertical === vertical);
  const generic = OUTREACH_PRESETS_USA.filter(
    (p) =>
      p.vertical === "generico" &&
      !dedicated.some((d) => d.stage === p.stage)
  );
  return [...dedicated, ...generic];
}

/**
 * Sugiere el próximo preset según el último stage usado con un prospecto.
 * Útil para automatizar follow-ups.
 */
export function suggestNextStage(lastStage: OutreachStage | null): OutreachStage {
  switch (lastStage) {
    case null:
      return "cold_opener_audio_script";
    case "cold_opener_audio_script":
    case "cold_opener_text":
      return "post_audit_followup";
    case "post_audit_followup":
      return "no_reply_followup_2d";
    case "no_reply_followup_2d":
      return "no_reply_followup_5d";
    case "no_reply_followup_5d":
      return "no_reply_followup_10d";
    // Tras manejar una objeción, el siguiente paso es cerrar en llamada;
    // tras la llamada, mandar el link de pago. close_payment_link es terminal.
    case "close_call_invite":
      return "close_payment_link";
    case "close_payment_link":
      return "close_payment_link";
    default:
      return "close_call_invite";
  }
}

/**
 * Resuelve el preset para una etapa, prefiriendo el vertical dedicado y la
 * versión pedida, con fallback a "generico" y luego a cualquier versión.
 * Lo usa el cron de seguimientos para elegir qué mensaje toca enviar.
 */
export function getPresetByStage(
  stage: OutreachStage,
  vertical: OutreachVertical = "generico",
  version: "v1" | "v2" = "v2"
): OutreachPreset | undefined {
  const candidates = OUTREACH_PRESETS_USA.filter((p) => p.stage === stage);
  return (
    candidates.find((p) => p.vertical === vertical && (p.version || "v1") === version) ||
    candidates.find((p) => p.vertical === "generico" && (p.version || "v1") === version) ||
    candidates.find((p) => p.vertical === vertical) ||
    candidates.find((p) => p.vertical === "generico") ||
    candidates[0]
  );
}

export const VERTICAL_LABELS = verticalLabel;

/* ═══════════════════════════════════════════════════════════════════════
 * TEMPLATES META A SOMETER (WhatsApp Manager → Message Templates)
 * Categoría: MARKETING · Idioma: es · Footer obligatorio en TODOS:
 *   "Responde BAJA para no recibir más mensajes."
 * (el webhook ya procesa "baja" como opt-out; el footer mejora la tasa de
 * aprobación y protege el quality rating del número)
 *
 * IMPORTANTE: el orden de variables {{1}},{{2}},{{3}} corresponde al orden
 * de `vars` del preset que lo referencia (presetToBodyVars mapea en orden).
 *
 * 1. indexa_usa_opener_v2 — {{1}}=nombre {{2}}=negocio {{3}}=ciudad
 *    Hola {{1}}, te escribo de INDEXA. Encontré {{2}} en Google y noté que
 *    cuando alguien en {{3}} busca lo que ustedes ofrecen, aparecen primero
 *    otros negocios — esos clientes ya los estaban buscando a ustedes. Nos
 *    encargamos del marketing completo de negocios hispanos: página web,
 *    anuncios en español e inglés y clientes directo a su WhatsApp, por $497
 *    al mes con garantía de 30 días: si no ven leads, el mes siguiente va por
 *    nuestra cuenta. ¿Les mando una auditoría gratis de 3 minutos? Respondan
 *    SÍ y hoy se la armo.
 *
 * 2. indexa_usa_followup_d2 — {{1}}=nombre {{2}}=negocio
 *    Hola {{1}}, te escribí hace unos días sobre el marketing de {{2}} y no
 *    quiero que se pierda el mensaje. Resumen: nos encargamos de todo (página,
 *    anuncios en español e inglés, clientes por WhatsApp) por $497 al mes, con
 *    garantía de 30 días — si no ves leads, el mes siguiente va por nuestra
 *    cuenta. ¿Te mando una auditoría gratis de tu negocio? Responde SÍ y hoy
 *    te la armo.
 *
 * 3. indexa_usa_followup_d5 — {{1}}=nombre {{2}}=ciudad
 *    Hola {{1}}, en {{2}} solo trabajamos con un número limitado de negocios
 *    por giro — no posicionamos a dos competidores en la misma zona. Este mes
 *    quedan 2 espacios y uno te lo puedo apartar hoy sin compromiso. La
 *    garantía de 30 días sigue en pie: si no ves leads, el mes siguiente va
 *    por nuestra cuenta. ¿Quieres tu espacio? Responde SÍ.
 *
 * 4. indexa_usa_followup_d10 — {{1}}=nombre {{2}}=negocio
 *    Hola {{1}}, esta es la última vez que te escribo. Solo un dato: cada mes
 *    que {{2}} no aparece arriba en Google, tus competidores se quedan con
 *    clientes que ya te buscaban. Cuando quieras detener eso, respóndeme y
 *    armamos tu plan ese mismo día, con garantía de 30 días. Mucho éxito.
 * ═══════════════════════════════════════════════════════════════════════ */
