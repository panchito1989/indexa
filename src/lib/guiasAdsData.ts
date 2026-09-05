/**
 * Registro del cluster de guías de administración de campañas.
 *
 * Las 16 guías anteriores siguen siendo páginas estáticas bajo
 * `src/app/guia/<slug>/page.tsx`. Next prioriza la ruta estática sobre la
 * dinámica `[slug]`, así que ambas conviven sin tocarse.
 */

export interface GuiaSeccion {
  /** Encabezado. Debe ser la pregunta literal que responde (spec §5.3). */
  titulo: string;
  /**
   * Párrafos en texto plano: la página los renderiza tal cual, sin markdown.
   * Para destacar algo, sepáralo en su propia sección, lista o tabla.
   */
  parrafos: string[];
  /** Lista numerada de pasos, opcional. */
  pasos?: string[];
  /** Tabla comparativa, opcional. Los modelos la extraen con alta fidelidad. */
  tabla?: { encabezados: string[]; filas: string[][] };
}

export interface GuiaFAQ {
  pregunta: string;
  respuesta: string;
}

export interface GuiaDatoPropio {
  /** Slug del caso en `src/data/casos-ads.json` que respalda la guía. */
  caso: string;
  /**
   * Frase que envuelve las cifras. Placeholders válidos: los de
   * `PLACEHOLDERS_DATO_PROPIO`. Debe usar al menos una cifra
   * (`{inversion}`, `{contactos}`, `{costoPorContacto}` o `{tasaContacto}`):
   * una plantilla que sólo dice "{industria} en {ciudad}" no aporta dato.
   * Si el caso no existe, la página omite el bloque entero: nunca inventa.
   */
  plantilla: string;
}

export interface GuiaAds {
  slug: string;
  mercado: "mx" | "usa";
  familia: "diagnostico" | "presupuesto" | "decision" | "traduccion";
  seoTitle: string;
  seoDescription: string;
  h1: string;
  /** 40-60 palabras, autocontenida, citable sola. Spec §5.1. */
  respuestaDirecta: string;
  secciones: GuiaSeccion[];
  faq: GuiaFAQ[];
  datoPropio: GuiaDatoPropio;
  /** Slugs de 2-3 guías de la misma familia. */
  hermanas: string[];
  /**
   * Ancla del caso de éxito de esa industria dentro de /casos-de-exito
   * (spec §4.3). Hoy esa página está desconectada del resto del sitio; esto
   * es lo que convierte el consejo genérico en "esta gente ya lo hizo".
   * `null` mientras no exista un caso publicado para la industria.
   */
  casoExito: string | null;
  /** "YYYY-MM", visible en la página. Spec §5.5. */
  actualizado: string;
}

/** Placeholders que `renderDatoPropio` sustituye con las cifras del caso. */
export const PLACEHOLDERS_DATO_PROPIO = [
  "inversion",
  "contactos",
  "costoPorContacto",
  "tasaContacto",
  "industria",
  "ciudad",
] as const;

/** Los que aportan una cifra. La plantilla debe usar al menos uno. */
const PLACEHOLDERS_CON_CIFRA = ["inversion", "contactos", "costoPorContacto", "tasaContacto"];

const ABRE_CON_RELLENO = /en este art[íi]culo|a continuaci[óo]n|veremos/i;

export const guiasAds: GuiaAds[] = [
  {
    slug: "cuanto-gastar-en-google-ads-negocio-local",
    mercado: "mx",
    familia: "presupuesto",
    seoTitle: "Cuánto invertir en Google Ads para que funcione en un negocio local",
    seoDescription:
      "Cuánto presupuesto necesita un negocio de servicio local para que Google Ads funcione en México: qué esperar al arrancar una cuenta nueva y qué esperar cuando ya está optimizada, con datos reales de una cuenta que administramos.",
    h1: "¿Cuánto presupuesto necesitas para que Google Ads funcione en un negocio local?",
    respuestaDirecta:
      "No hay una cifra fija: el piso depende del costo por clic en tu industria y ciudad. Como referencia real, un negocio de servicio local que administramos invirtió $15,414 MXN en un mes y recibió 97 contactos por WhatsApp y llamada, a $159 cada uno, tras arrancar con $3,778 MXN y 11 contactos a $343 cada uno en sus primeros nueve días.",
    secciones: [
      {
        titulo: "¿Qué pasa si mi presupuesto es demasiado bajo?",
        parrafos: [
          "Un presupuesto insuficiente no se nota primero en el gasto, se nota en la falta de datos: pocos clics, pocas conversiones y ningún patrón claro para optimizar. Google Ads necesita volumen para aprender qué búsquedas, horarios y zonas convierten mejor en tu negocio; con muy poco gasto, cada semana parece distinta a la anterior porque el sistema apenas acumula información.",
          "El costo por clic de tu industria decide dónde está ese piso: un giro con clics caros necesita más presupuesto para juntar el mismo número de conversiones que uno con clics baratos. Por eso no existe una cifra que sirva igual para todos los negocios locales.",
        ],
      },
      {
        titulo: "¿Cuánto invirtió y qué recibió una cuenta real de servicio local?",
        parrafos: [
          "La referencia de esta guía es un centro de servicio de electrodomésticos y pantallas en CDMX y Estado de México, un cliente que administramos, con datos anonimizados de un solo mes. La comparación entre su arranque y su primer mes completo muestra el patrón con números reales, no con una tabla genérica:",
        ],
        tabla: {
          encabezados: ["Periodo", "Inversión", "Contactos", "Costo por contacto"],
          filas: [
            ["23–31 de julio de 2026 (arranque)", "$3,778 MXN", "11", "$343 MXN"],
            ["1–31 de agosto de 2026 (mes completo)", "$15,414 MXN", "97", "$159 MXN"],
          ],
        },
      },
      {
        titulo: "¿Cómo sé si mi presupuesto actual ya es suficiente?",
        parrafos: [
          "Revisa dos señales en tu propia cuenta antes de mirar hacia afuera: si el costo por contacto baja mes a mes mientras el presupuesto se mantiene estable, ya llegaste a un tamaño donde el sistema optimiza bien. Si en cambio el costo por contacto sube o se mueve sin patrón, el problema no es solo el tamaño del presupuesto, sino la segmentación o cómo mides las conversiones.",
        ],
        pasos: [
          "Compara el costo por contacto de este mes contra el mes anterior de tu propia cuenta, no contra un promedio de la industria que no conoces.",
          "Revisa si el gasto se reparte entre muchas campañas pequeñas o se concentra donde ya sabes que hay demanda.",
          "Si llevas menos de un mes con la misma inversión, dale tiempo antes de concluir que el presupuesto es insuficiente.",
        ],
      },
      {
        titulo: "¿Subir el presupuesto de golpe mejora los resultados?",
        parrafos: [
          "Subir el presupuesto de un día para otro no reproduce el efecto de invertir de forma constante: el sistema vuelve a ajustar pujas y audiencias, y durante ese ajuste el costo por contacto puede subir antes de bajar. En la cuenta real de esta guía, el costo por contacto general pasó de $343 en sus primeros nueve días a $159 en su primer mes completo, con una inversión mensual mayor y sostenida; los dos periodos no son del mismo tamaño, así que la comparación es orientativa.",
        ],
      },
    ],
    faq: [
      {
        pregunta: "¿Cuánto necesito para empezar con Google Ads en un negocio local?",
        respuesta:
          "No hay un mínimo universal: depende del costo por clic de tu industria y de cuánta competencia hay en tu ciudad. Lo que más importa es sostener la misma inversión varias semanas seguidas en vez de cambiar el monto cada semana, porque eso es lo que le da al sistema datos consistentes para optimizar.",
      },
      {
        pregunta: "¿Un presupuesto más alto siempre da más contactos?",
        respuesta:
          "No de forma proporcional. Más presupuesto ayuda a competir por más subastas, pero si la segmentación, la página de destino o la medición de conversiones tienen un problema, ese problema se repite a mayor escala y el costo por contacto puede no bajar.",
      },
      {
        pregunta: "¿Cuánto tarda una cuenta nueva en volverse eficiente?",
        respuesta:
          "No hay un plazo fijo. En la cuenta real de esta guía, el costo por contacto pasó de $343 en sus primeros nueve días a $159 en su primer mes completo. El ritmo exacto depende de cuántas conversiones acumule tu cuenta cada semana.",
      },
      {
        pregunta: "¿Debo comparar mi presupuesto contra el de otros negocios de mi giro?",
        respuesta:
          "Sirve como referencia general, pero el costo por clic varía por ciudad, temporada y cuánta competencia puja por las mismas palabras clave. Un número real de tu propia cuenta, sostenido varias semanas, dice más que un promedio ajeno.",
      },
    ],
    datoPropio: {
      caso: "centro-servicio-electrodomesticos-cdmx",
      plantilla:
        "En agosto de 2026, un {industria} en {ciudad} que administramos invirtió {inversion} y recibió {contactos} contactos por WhatsApp y llamada: {costoPorContacto} por contacto, con {tasaContacto} de los clics terminando en un mensaje.",
    },
    hermanas: ["administrar-google-ads-yo-mismo-o-contratar", "que-es-roas-cpl-cpc-explicado-simple"],
    casoExito: null,
    actualizado: "2026-09",
  },
  {
    slug: "administrar-google-ads-yo-mismo-o-contratar",
    mercado: "mx",
    familia: "decision",
    seoTitle: "Administrar Google Ads yo mismo o contratar el servicio: cómo decidir",
    seoDescription:
      "Qué exige administrar Google Ads bien, cuánto cambia el costo por contacto cuando alguien revisa la cuenta cada semana, y cuándo conviene contratar el servicio en vez de aprenderlo tú mismo, con un caso real.",
    h1: "¿Me conviene administrar Google Ads yo mismo o contratar a alguien que lo haga?",
    respuestaDirecta:
      "Depende de cuánto vale tu tiempo y qué tan rápido necesitas resultados. Administrar Google Ads bien exige revisar la cuenta cada semana, probar segmentaciones y ajustar pujas con datos, no por intuición. En una cuenta real que administramos, la campaña principal pasó de $343 a $206 por contacto entre sus primeros nueve días de julio y agosto de 2026.",
    secciones: [
      {
        titulo: "¿Cuánto tiempo toma administrar Google Ads bien?",
        parrafos: [
          "Administrar una cuenta no es prender las campañas y dejarlas: exige revisar el reporte de términos de búsqueda, pausar lo que no convierte, mover presupuesto entre campañas y dar seguimiento a la medición de conversiones de forma constante, semana con semana. Ese tiempo compite directamente con el tiempo que el dueño del negocio necesita para operar el negocio mismo, no la cuenta de anuncios.",
        ],
      },
      {
        titulo: "¿Qué pasa si administro la cuenta yo mismo sin experiencia?",
        parrafos: [
          "Lo más común no es que la cuenta deje de generar contactos, sino que el costo por contacto se quede alto porque nadie revisa qué palabras clave gastan sin convertir, ni ajusta la segmentación cuando cambia la demanda. Aprender a hacerlo bien es posible, pero tiene una curva: los primeros meses casi siempre cuestan más por contacto que los siguientes, mientras se identifica qué funciona en ese negocio en particular.",
        ],
      },
      {
        titulo: "¿Cuánto cambió el costo por contacto en una cuenta real entre su arranque y su primer mes?",
        parrafos: [
          "En una cuenta real que administramos —un centro de servicio de electrodomésticos y pantallas en CDMX y Estado de México, con datos anonimizados de agosto de 2026—, el costo por contacto no fue el mismo en las distintas campañas ni a lo largo del tiempo:",
        ],
        tabla: {
          encabezados: ["Ventana", "Costo por contacto"],
          filas: [
            ["Primeros 9 días (23–31 jul), cuenta completa", "$343 MXN"],
            ["Agosto, campaña principal", "$206 MXN"],
            ["Agosto, campaña de televisores", "$24 MXN"],
          ],
        },
      },
      {
        titulo: "¿Cuándo conviene contratar en vez de aprenderlo yo mismo?",
        parrafos: [
          "La plataforma de INDEXA cuesta $699 MXN al mes e incluye las herramientas y la IA para que administres tú mismo tus campañas de Google, Meta y TikTok Ads. Que nosotros operemos la cuenta día a día —revisando pujas, segmentación y presupuesto cada semana— es un servicio aparte, que se cotiza según la inversión publicitaria del negocio, no con una tarifa fija.",
        ],
        pasos: [
          "Cuánto tiempo a la semana puedes dedicarle de forma constante, no solo el primer mes.",
          "Si vas a operar una cuenta con historial o vas a empezar desde cero, como la cuenta de este caso.",
          "Si prefieres pagar una tarifa fija y operar tú con la plataforma, o que alguien más absorba ese tiempo.",
        ],
      },
    ],
    faq: [
      {
        pregunta: "¿Cuánto cuesta que INDEXA administre mis campañas?",
        respuesta:
          "No hay una tarifa fija: se cotiza según la inversión publicitaria de tu negocio y se define en la asesoría inicial. La plataforma, aparte, cuesta $699 MXN al mes e incluye las herramientas para que tú mismo operes tus campañas con IA.",
      },
      {
        pregunta: "¿Puedo empezar administrando yo y contratar después?",
        respuesta:
          "Sí. Muchos negocios empiezan operando su propia cuenta con la plataforma y deciden contratar el servicio cuando el tiempo que exige revisar la cuenta cada semana ya no les alcanza, o cuando prefieren enfocarse en operar el negocio en vez de la cuenta de anuncios.",
      },
      {
        pregunta: "¿Administrarla yo mismo da peores resultados?",
        respuesta:
          "No necesariamente, pero sí exige constancia: revisar la cuenta de forma esporádica suele dejar dinero gastado en palabras clave o segmentaciones que no convierten. El resultado depende más de la constancia que de quién oprime los botones.",
      },
      {
        pregunta: "¿Qué gano si contrato el servicio en vez de aprenderlo?",
        respuesta:
          "Principalmente tiempo: alguien más revisa la cuenta cada semana con la disciplina que exige bajar el costo por contacto, mientras tú te enfocas en atender los contactos que ya llegan.",
      },
    ],
    datoPropio: {
      caso: "centro-servicio-electrodomesticos-cdmx",
      plantilla:
        "En agosto de 2026, un {industria} en {ciudad} que administramos recibió {contactos} contactos por WhatsApp y llamada con {inversion} invertidos: {costoPorContacto} por contacto en su primer mes completo.",
    },
    hermanas: ["cuanto-gastar-en-google-ads-negocio-local", "que-es-roas-cpl-cpc-explicado-simple"],
    casoExito: null,
    actualizado: "2026-09",
  },
  {
    slug: "que-es-roas-cpl-cpc-explicado-simple",
    mercado: "mx",
    familia: "traduccion",
    seoTitle: "Qué son ROAS, CPL y CPC en Google Ads: guía simple",
    seoDescription:
      "Qué significan ROAS, CPL, CPC y las demás siglas de Google Ads, explicadas en español simple con cifras reales de costo por contacto de una cuenta que administramos: $159, $206 y $24.",
    h1: "¿Qué significan ROAS, CPL y CPC en Google Ads?",
    respuestaDirecta:
      "CPC es lo que cuesta cada clic. CPL, o costo por contacto, es lo que cuesta cada conversión: un formulario, llamada o mensaje de WhatsApp. ROAS compara el ingreso por ventas contra lo invertido en anuncios. En una cuenta real de servicio local que administramos, el CPL promedio fue $159, con la campaña principal en $206 y la de televisores en $24.",
    secciones: [
      {
        titulo: "¿Qué es el CPC (costo por clic)?",
        parrafos: [
          "El CPC es lo que Google cobra cada vez que alguien hace clic en tu anuncio, sin importar si esa persona después te contacta o no. Es la métrica más básica y la que menos dice por sí sola: un CPC bajo con pocas conversiones puede salir más caro, al final, que un CPC alto con muchas.",
        ],
      },
      {
        titulo: "¿Qué es el CPL o costo por contacto?",
        parrafos: [
          "El CPL, o costo por lead, es lo que cuesta cada conversión: un formulario lleno, una llamada o, en la mayoría de negocios locales, un mensaje de WhatsApp. Es el número que más importa para decidir si una campaña funciona, porque conecta el gasto directamente con algo que el negocio puede dar seguimiento.",
          "En una cuenta real que administramos —un centro de servicio de electrodomésticos y pantallas en CDMX y Estado de México, con datos anonimizados de agosto de 2026—, el CPL no fue un número único: varió por campaña.",
        ],
        tabla: {
          encabezados: ["Campaña", "CPL (costo por contacto)"],
          filas: [
            ["Cuenta completa (promedio)", "$159 MXN"],
            ["Campaña principal", "$206 MXN"],
            ["Campaña de televisores", "$24 MXN"],
          ],
        },
      },
      {
        titulo: "¿Qué es el ROAS y por qué esta cuenta no lo usa?",
        parrafos: [
          "ROAS significa retorno de la inversión publicitaria: cuánto ingreso por ventas genera cada peso gastado en anuncios. Es la métrica correcta para una tienda en línea que puede rastrear el valor de cada compra. Un centro de servicio, un taller o un consultorio no venden dentro del anuncio: el anuncio genera un contacto, no una transacción, así que lo que se mide ahí es el costo por contacto, no el retorno sobre ventas.",
        ],
      },
      {
        titulo: "¿Qué otras siglas voy a encontrar en mi cuenta de Google Ads?",
        parrafos: [
          "Además de CPC, CPL y ROAS, estas son las que más vas a encontrar dentro de la plataforma:",
        ],
        pasos: [
          "CTR (tasa de clics): qué porcentaje de las personas que ven tu anuncio le dan clic.",
          "Tasa de conversión: qué porcentaje de los clics termina en una conversión medida, como un contacto por WhatsApp o llamada.",
          "Cuota de impresiones: qué porcentaje de las subastas donde tu anuncio podía aparecer realmente apareció, frente a la competencia.",
          "Impresiones: cuántas veces se mostró tu anuncio, sin importar si alguien le dio clic.",
        ],
      },
      {
        titulo: "¿Qué tan buena es una tasa de conversión de clic a contacto?",
        parrafos: [
          "También depende de la industria, pero un número real ayuda a calibrar: en la cuenta de esta guía, 39% de los clics terminaron en un contacto por WhatsApp o llamada durante agosto de 2026, es decir, 97 contactos sobre 249 clics.",
        ],
      },
    ],
    faq: [
      {
        pregunta: "¿CPL y CPA son lo mismo?",
        respuesta:
          "Sí, en la práctica: CPL (costo por lead) y CPA (costo por adquisición) se usan casi como sinónimos. Cuando la conversión es un contacto —formulario, llamada o WhatsApp— casi todos le dicen CPL; cuando la conversión es una venta directa dentro del anuncio, es más común llamarlo CPA.",
      },
      {
        pregunta: "¿Un CPC bajo significa que la campaña va bien?",
        respuesta:
          "No necesariamente. El CPC solo mide el costo del clic, no si esa persona termina contactando al negocio. Una campaña con CPC bajo pero pocos contactos puede salir más cara por contacto que una con CPC más alto y mejor conversión.",
      },
      {
        pregunta: "¿Por qué mi cuenta no muestra ROAS?",
        respuesta:
          "Porque ROAS necesita que Google sepa el valor de cada venta, y eso solo pasa si vendes dentro del sitio o app con seguimiento de ingresos. Si tu conversión es un clic a WhatsApp o una llamada, como en la mayoría de negocios locales, la métrica que corresponde es el CPL, no el ROAS.",
      },
      {
        pregunta: "¿Cuál es un buen CPL?",
        respuesta:
          "Depende por completo de la industria, la ciudad y cuánto vale cada contacto para tu negocio. Como referencia real, no como regla general: la cuenta de esta guía tuvo un CPL promedio de $159, con una campaña en $206 y otra en $24.",
      },
    ],
    datoPropio: {
      caso: "centro-servicio-electrodomesticos-cdmx",
      plantilla:
        "En agosto de 2026, un {industria} en {ciudad} que administramos tuvo un CPL (costo por contacto) promedio de {costoPorContacto} sobre {contactos} contactos por WhatsApp y llamada, con {inversion} invertidos ese mes.",
    },
    hermanas: ["cuanto-gastar-en-google-ads-negocio-local", "administrar-google-ads-yo-mismo-o-contratar"],
    casoExito: null,
    actualizado: "2026-09",
  },
];

export function buscarGuia(slug: string): GuiaAds | null {
  return guiasAds.find((g) => g.slug === slug) ?? null;
}

export interface ContextoValidacion {
  /** Slugs de todas las guías del registro (para resolver `hermanas`). */
  slugs: Set<string>;
  /** Carpetas estáticas bajo `src/app/guia/` (no pueden repetirse como slug). */
  estaticas: Set<string>;
}

/**
 * Reglas de citabilidad del spec §5 aplicadas a una guía. Devuelve la lista
 * de violaciones; vacía si la guía es publicable.
 *
 * Es la única definición de "guía válida": el test del registro la aplica a
 * cada entrada, y los fixtures del test prueban que cada regla realmente
 * rechaza lo que debe rechazar (con el registro vacío, un bucle sobre él no
 * demostraría nada).
 */
export function validarGuia(g: GuiaAds, ctx: ContextoValidacion): string[] {
  const fallas: string[] = [];

  if (!/^[a-z0-9-]+$/.test(g.slug)) fallas.push(`slug inválido: "${g.slug}"`);
  if (ctx.estaticas.has(g.slug)) fallas.push(`slug choca con una guía estática: "${g.slug}"`);
  if (!["mx", "usa"].includes(g.mercado)) fallas.push(`mercado inválido: "${g.mercado}"`);

  if (g.seoTitle.length <= 20) fallas.push("seoTitle demasiado corto");
  if (g.seoDescription.length <= 80) fallas.push("seoDescription demasiado corta");
  if (g.h1.length <= 10) fallas.push("h1 demasiado corto");
  if (g.secciones.length === 0) fallas.push("sin secciones");
  if (g.faq.length < 3) fallas.push("faq con menos de 3 preguntas");
  if (!/^\d{4}-\d{2}$/.test(g.actualizado)) fallas.push(`actualizado inválido: "${g.actualizado}"`);

  const palabras = g.respuestaDirecta.trim().split(/\s+/).filter(Boolean).length;
  if (palabras < 35 || palabras > 70) fallas.push(`respuestaDirecta con ${palabras} palabras (debe tener 35-70)`);
  if (ABRE_CON_RELLENO.test(g.respuestaDirecta)) fallas.push("respuestaDirecta abre con relleno");

  if (g.datoPropio.caso.length === 0) fallas.push("datoPropio sin caso");
  const usados = [...g.datoPropio.plantilla.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const desconocidos = usados.filter((u) => !(PLACEHOLDERS_DATO_PROPIO as readonly string[]).includes(u));
  for (const u of desconocidos) fallas.push(`placeholder desconocido: {${u}}`);
  if (!usados.some((u) => PLACEHOLDERS_CON_CIFRA.includes(u))) fallas.push("plantilla sin ninguna cifra");

  for (const h of g.hermanas) {
    if (h === g.slug) fallas.push("hermana apunta a sí misma");
    else if (!ctx.slugs.has(h)) fallas.push(`hermana inexistente: "${h}"`);
  }

  return fallas;
}
