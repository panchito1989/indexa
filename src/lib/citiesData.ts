/**
 * Contenido local de la landing /pagina-web-cdmx.
 *
 * Historia: hubo ocho ciudades con la misma plantilla (sólo cambiaba el
 * nombre) y un "testimonio compuesto ficticio" por ciudad. Google las dejó tres
 * meses en "Descubierta, sin indexar" y los testimonios inventados restaban
 * credibilidad (E-E-A-T). En 2026-10 se fusionaron en /servicios/sitios-web-ia
 * (ver `redireccionesLegacy.ts`) y se conservó sólo CDMX, donde INDEXA tiene un
 * caso real publicado (`casos-ads.json`). La prueba social de la landing es
 * ese caso, no un testimonio.
 *
 * Regla: sólo datos verificables o descripciones cualitativas. Nada de
 * estimaciones de búsquedas, porcentajes o conteos de clientes sin fuente.
 */

export interface CityZone {
  name: string;
  notas: string;
}

export interface CityIndustry {
  giro: string;
  descripcion: string;
  porQueImporta: string;
}

export interface CityFAQ {
  pregunta: string;
  respuesta: string;
}

export interface CityData {
  slug: string;
  nombreCorto: string;
  nombreCompleto: string;
  estado: string;
  /** Dato público (INEGI, Censo 2020), redondeado. */
  poblacion: string;
  /** Dato público (INEGI, DENUE), redondeado. */
  pymesEstimadas: string;
  /** 2-3 oraciones sobre el mercado local, sin cifras sin fuente. */
  contextoLocal: string;
  /** Zonas con mayor densidad comercial. */
  zonas: CityZone[];
  /** 3 giros donde un sitio web hace más diferencia. */
  girosTopLocal: CityIndustry[];
  /** Preguntas específicas de la ciudad, además de las genéricas de la página. */
  faqExtras: CityFAQ[];
}

export const ciudades: Record<string, CityData> = {
  cdmx: {
    slug: "cdmx",
    nombreCorto: "CDMX",
    nombreCompleto: "Ciudad de México",
    estado: "Ciudad de México",
    poblacion: "9.2 millones de habitantes (INEGI, Censo 2020)",
    pymesEstimadas: "más de 450,000 unidades económicas (INEGI, DENUE)",
    contextoLocal:
      "La Ciudad de México es el mercado más competido de México para presencia digital. Tener un sitio web optimizado para SEO local en alcaldías como Cuauhtémoc, Miguel Hidalgo, Coyoacán o Benito Juárez deja de ser opcional: es la diferencia entre que un cliente te encuentre a cuatro cuadras o termine en tu competencia. Y es donde INDEXA administra la cuenta del caso real que publicamos en esta página.",
    zonas: [
      { name: "Cuauhtémoc (Centro, Roma, Condesa, Doctores)", notas: "Alta densidad de restaurantes, agencias creativas y profesionistas." },
      { name: "Benito Juárez (Del Valle, Narvarte, Nápoles)", notas: "Negocios de servicios, consultorios y tiendas especializadas." },
      { name: "Miguel Hidalgo (Polanco, Anzures, Lomas)", notas: "Marcas premium, profesionistas y comercio gourmet." },
      { name: "Coyoacán y Tlalpan", notas: "Comercio de barrio, salud, educación, turismo cultural." },
      { name: "Iztapalapa, GAM y Álvaro Obregón", notas: "Volumen de PYMES de servicios, mecánica, alimentos preparados." },
      { name: "Zona conurbada del Estado de México", notas: "Servicios a domicilio (reparaciones, electrodomésticos, mantenimiento) que atienden CDMX y municipios vecinos." },
    ],
    girosTopLocal: [
      {
        giro: "Restaurantes y cocinas dark kitchen",
        descripcion: "La capital concentra decenas de miles de establecimientos de comida.",
        porQueImporta: "El cliente busca menú, fotos y reseñas en Google antes de pedir o ir. Sin web, pierdes contra el de al lado.",
      },
      {
        giro: "Servicios a domicilio y centros de servicio",
        descripcion: "Reparación de electrodomésticos, plomería, electricidad, mantenimiento: el cliente busca el mismo día que tiene el problema.",
        porQueImporta: "Es el giro del caso real que publicamos aquí: los contactos llegan por WhatsApp y llamada desde la búsqueda, y se concentran en lunes.",
      },
      {
        giro: "Consultorios médicos y dentales",
        descripcion: "La capital concentra una alta densidad de profesionales de salud.",
        porQueImporta: "Pacientes nuevos buscan 'dentista cerca de mí' y eligen al primero que aparece en Google con buenas reseñas.",
      },
    ],
    faqExtras: [
      {
        pregunta: "¿INDEXA optimiza para alcaldías específicas de CDMX?",
        respuesta:
          "Sí. Cada sitio incluye Schema.org local con tu dirección, alcaldía y código postal. Google entiende exactamente dónde estás y te muestra a quien busca tu giro en tu zona: Roma Norte, Polanco, Coyoacán, Del Valle, Iztapalapa, etc.",
      },
      {
        pregunta: "¿Cuánto tarda en aparecer mi sitio en Google si estoy en CDMX?",
        respuesta:
          "Las primeras impresiones en búsquedas locales suelen llegar en las primeras semanas. En CDMX la competencia es alta, así que subir en el mapa y en el top local depende de completar todo: SEO local, Google Business Profile, reseñas y contenido. En zonas menos saturadas suele ser más rápido.",
      },
      {
        pregunta: "¿Tienen clientes en CDMX que pueda ver?",
        respuesta:
          "Sí. En esta misma página publicamos un caso real y anónimo de un centro de servicio en CDMX y Estado de México, con las cifras de su cuenta de Google Ads tal como salen de la exportación. Por confidencialidad no listamos nombres ni URLs; en una llamada te mostramos lo relevante para tu giro y zona.",
      },
    ],
  },
};

export const getCityData = (slug: string): CityData | undefined => ciudades[slug];
