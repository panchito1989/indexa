# SEO + GEO para administración de campañas publicitarias

**Fecha:** 2026-09-03
**Estado:** Diseño aprobado, pendiente plan de implementación
**Documento previo relacionado:** `docs/seo-geo-strategy-mexico.md`

---

## 1. Problema

INDEXA administra cuentas de Google Ads, Meta Ads y TikTok Ads, pero una parte
importante del mercado objetivo **no sabe operar esas plataformas** y por lo tanto
nunca busca "agencia de Google Ads". Busca su dolor: gastó dinero, no vendió, y no
entiende por qué.

Todo el contenido actual del sitio (incluido el cluster "agencia" de la estrategia
previa) apunta a intención *"quiero una página web / quiero una agencia"*. No existe
ninguna página que capture la intención *"prendí anuncios y no me funcionó"*.

Además, ese usuario cada vez consulta menos en Google y más en asistentes de IA
(ChatGPT, Perplexity, Claude, Gemini). Ahí la competencia no es por posición, es por
**citación**: a quién nombra el modelo cuando alguien pide ayuda.

## 2. Objetivo

Que un dueño de negocio que no sabe usar las plataformas de anuncios llegue a INDEXA
—desde Google o desde un asistente de IA— y contrate **administración mensual de
campañas** (done-for-you).

### No-objetivos

- No se rediseña ni se reemplaza el cluster "agencia" existente.
- No se vende autoservicio ni software: la oferta es servicio administrado.
- No se ataca el mercado anglo en USA (sólo hispano).

## 3. Decisiones tomadas

| Decisión | Valor |
|---|---|
| Oferta | Administración mensual done-for-you (servicio, no software) |
| Mercados | México y USA-Hispano en paralelo, clusters separados |
| Activo diferenciador | Datos agregados de las cuentas administradas + casos de éxito con números reales |
| Capacidad | Alta: contenido + construcción de herramientas nuevas |
| Enfoque | Los tres frentes (contenido, auditor, observatorio) ejecutados en fases |
| WhatsApp | `5610669353` reemplaza a `5622042820` en **todo** el sitio, centralizado |

## 4. Arquitectura de contenido

### 4.1 Hubs de servicio (nuevos)

- `/administracion-de-campanas` — MX, español-MX, precios MXN
- `/administracion-de-campanas-usa` — USA-Hispano, español-US, precios USD
  (sigue la convención existente `plomeros-usa`, `construccion-usa`)

Son distintos de `/agencia-google-ads`: ese ataca a quien ya sabe que quiere agencia;
estos atacan a quien sólo sabe que está perdiendo dinero. Ambos hubs llevan
`Service` + `offers` en JSON-LD y son el destino comercial de todo el cluster.

### 4.2 Cluster de dolor bajo `/guia/`

Se reutiliza `/guia/`, que ya tiene autoridad acumulada (16 guías vivas).

**México — 12 páginas**

| # | URL | Familia |
|---|---|---|
| 1 | `/guia/por-que-mi-campana-de-google-ads-no-vende` | Diagnóstico |
| 2 | `/guia/gaste-en-facebook-ads-y-no-vendi-nada` | Diagnóstico |
| 3 | `/guia/performance-max-gasta-y-no-convierte` | Diagnóstico |
| 4 | `/guia/conversiones-mal-configuradas-google-ads` | Diagnóstico |
| 5 | `/guia/cuanto-gastar-en-google-ads-negocio-local` | Presupuesto |
| 6 | `/guia/cuanto-cobra-una-agencia-por-administrar-google-ads` | Presupuesto |
| 7 | `/guia/presupuesto-meta-ads-negocio-local-mexico` | Presupuesto |
| 8 | `/guia/administrar-google-ads-yo-mismo-o-contratar` | Decisión |
| 9 | `/guia/como-saber-si-mi-agencia-lo-esta-haciendo-bien` | Decisión |
| 10 | `/guia/google-ads-o-meta-ads-cual-me-conviene` | Decisión |
| 11 | `/guia/que-es-roas-cpl-cpc-explicado-simple` | Traducción |
| 12 | `/guia/errores-de-google-ads-que-comete-todo-principiante` | Traducción |

**USA-Hispano — 8 páginas** (mismos temas, sufijo `-usa`, precios USD, ciudades
Houston / Dallas / Miami / Phoenix / Atlanta, vocabulario español-US)

| # | URL |
|---|---|
| 1 | `/guia/por-que-mi-campana-de-google-ads-no-vende-usa` |
| 2 | `/guia/gaste-en-facebook-ads-y-no-vendi-nada-usa` |
| 3 | `/guia/cuanto-gastar-en-google-ads-negocio-hispano-usa` |
| 4 | `/guia/cuanto-cobra-una-agencia-google-ads-usa` |
| 5 | `/guia/administrar-mis-anuncios-o-contratar-agencia-usa` |
| 6 | `/guia/como-saber-si-mi-agencia-lo-esta-haciendo-bien-usa` |
| 7 | `/guia/google-ads-o-meta-ads-para-contractors-usa` |
| 8 | `/guia/errores-de-google-ads-negocios-hispanos-usa` |

Prioridad de producción: Diagnóstico y Presupuesto primero.

### 4.3 Enlazado interno

- Cada guía enlaza al hub de administración de su mercado.
- Cada guía enlaza a 2-3 guías hermanas de la misma familia.
- Cada guía enlaza al caso de éxito de su industria en `/casos-de-exito`
  (hoy esa página está desconectada del resto del sitio).
- Cada hub enlaza a las 12 / 8 guías de su mercado.

## 5. Reglas de citabilidad (GEO)

Obligatorias para toda página del cluster:

1. **Respuesta primero.** Las primeras 40-60 palabras responden el título de forma
   completa y auto-contenida. Deben poder citarse solas. Prohibido "En este
   artículo veremos…".
2. **Un dato propio por página**, con cifra y tamaño de muestra.
   Ejemplo: *"En las 47 cuentas de talleres mecánicos que administramos en México
   el CPL promedio es $118 MXN; las que corren Performance Max sin exclusión de
   marca pagan 2.4× más."* Una página sin dato propio es intercambiable y no se cita.
3. **Estructura extraíble.** Encabezados que son preguntas literales, tablas
   comparativas y listas numeradas de pasos.
4. **Schema por tipo de página** (ver 6.2).
5. **Fecha visible y fresca** ("Actualizado: septiembre 2026") en la página, no sólo
   en el schema.

**Regla de calidad sobre cantidad:** si una página no tiene dato propio que aportar,
no se publica. Preferible 12 guías con dato que 40 genéricas.

## 6. Infraestructura técnica

### 6.1 Crawlers de IA — `src/app/robots.ts`

Hoy hay reglas para `GPTBot`, `ClaudeBot`, `PerplexityBot` y `Google-Extended`.
Faltan los agentes de **búsqueda en vivo**, que son los que traen la respuesta cuando
un usuario pregunta (GPTBot es sólo entrenamiento):

- `OAI-SearchBot`, `ChatGPT-User`
- `Claude-User`, `Claude-SearchBot`
- `CCBot`
- `meta-externalagent`

### 6.2 Schema

Hoy sólo existe `Organization` global en `src/app/layout.tsx`. Se agrega:

| Tipo de página | Schema |
|---|---|
| Guías | `FAQPage` + `Article` (`author`, `datePublished`, `dateModified`) |
| Hubs de servicio | `Service` + `offers` |
| Todas | `BreadcrumbList` |
| Observatorio | `Dataset` |
| Organization global | ampliar `sameAs` con los perfiles externos de 9 |

### 6.3 `llms.txt` / `llms-full.txt`

`public/llms.txt` describe a INDEXA como plataforma de sitios web y **no menciona
administración de campañas**. Un modelo que lea ese archivo no tiene forma de
recomendar el servicio. Se reescribe:

- Sección de servicios con administración de campañas como oferta principal
- Los dos hubs nuevos
- El índice del cluster de guías
- Una sección de datos propios (el observatorio)

`llms-full.txt` incorpora el contenido completo de las guías nuevas.

### 6.4 Renderizado

Todas las páginas nuevas estáticas o ISR. Nunca client-side. Ya se removió el
`force-dynamic` global del layout por esta razón; no reintroducirlo.

### 6.5 Higiene de WhatsApp

Estado actual (inconsistente):

- `src/components/WhatsAppFloat.tsx` → `525622042820` hardcodeado
- `src/components/ContactForm.tsx:94` → `525622042820` hardcodeado
- `src/lib/emailTemplates.ts:5` → `NEXT_PUBLIC_WHATSAPP_NUMBER` con default
  `5215512345678`, un placeholder falso que se envía si la env var no está en Vercel

Cambios:

1. Constante única en `src/lib/` que lee `NEXT_PUBLIC_WHATSAPP_NUMBER` con default
   real `525610669353`. Los tres consumidores la usan.
2. Poner `NEXT_PUBLIC_WHATSAPP_NUMBER` en Vercel.
3. `WhatsAppFloat` montado en todas las rutas públicas. Hoy falta en las 16 guías de
   `/guia/`, en `/casos-de-exito`, en las landings `pagina-web-*`, `sitio-web-*`,
   `/directorio` y `/demo`. Se monta una sola vez desde un layout compartido en lugar
   de repetir `<WhatsAppFloat />` en cada `page.tsx` (hoy se repite en 12 archivos).

## 7. Auditor gratuito

### Obstáculo

El OAuth actual (`src/app/api/google-ads/resources/route.ts`) exige usuario
autenticado de Firebase y lee el token desde Firestore: está diseñado para clientes
registrados, no para un visitante anónimo. Además, pedirle a un desconocido que
conecte su cuenta de Ads es fricción muy alta.

### Fase 1 — auditor sin conexión

Formulario de 6 preguntas (90 segundos): plataforma, gasto mensual, industria,
ciudad, leads recibidos, y si mide conversiones.

Devuelve un diagnóstico comparado contra los benchmarks propios:

> *"Gastas $8,000 y recibes 12 leads = $667 por lead. Los talleres en Monterrey que
> administramos promedian $180. Estás pagando 3.7× de más."*

Cierre: WhatsApp a `5610669353` con el diagnóstico precargado en el mensaje.

Depende del observatorio: sin benchmarks el formulario no dice nada.

### Fase 2 — conexión real de la cuenta

Sólo si la fase 1 valida volumen. Extender el OAuth a sesión anónima y detectar
automáticamente: conversiones sin configurar, Performance Max sin exclusión de marca,
términos de búsqueda irrelevantes, presupuesto limitado por ranking.

## 8. Observatorio de datos

### 8.1 Pipeline

Job de agregación sobre las cuentas conectadas → colección en Firestore indexada por
`(industria, ciudad, plataforma)` → páginas estáticas regeneradas cada trimestre.

Métricas: CPC, CPL, ROAS, CTR — promedio y mediana.

### 8.2 Privacidad (no negociable)

- Mínimo **5 cuentas por celda** antes de publicar. Con menos, la celda se omite.
- Sólo agregados. Nunca datos identificables de un cliente.
- Aviso explícito en los términos de servicio sobre uso de datos agregados.

### 8.3 Salida

`/observatorio/costos-google-ads/[industria]/[ciudad]`, con `Dataset` schema,
metodología visible, tamaño de muestra y fecha de corte.

## 9. Distribución externa

Los modelos citan también lo que se dice de INDEXA fuera de su sitio. Sin esto el
contenido rinde la mitad.

- **Reddit** (r/emprendedores, r/mexico, r/PPC): respuestas genuinamente útiles con
  dato propio. Nada de spam.
- **YouTube**: un video corto por guía de diagnóstico; las transcripciones son fuente
  citable.
- **Perfiles de entidad**: Google Business Profile, LinkedIn de empresa, Crunchbase,
  directorios de agencias MX y USA — misma descripción en todos, cruzados con
  `sameAs` desde el JSON-LD.
- **Prensa de nicho**: el observatorio es material noticiable (dato original de costos
  publicitarios por industria).

## 10. Medición

| Qué | Cómo |
|---|---|
| Tráfico de IA | Filtrar referrals de `chatgpt.com`, `perplexity.ai`, `claude.ai`, `gemini.google.com` |
| Citación | Batería fija de 20 preguntas corrida mensualmente contra los 4 modelos, registrando aparición |
| Negocio | Leads del auditor → conversaciones de WhatsApp → contratos de administración firmados |

## 11. Fases

| Fase | Alcance | Depende de |
|---|---|---|
| **0 — Higiene** | WhatsApp unificado + botón en todas las rutas, crawlers de IA faltantes, `llms.txt` reescrito | — |
| **1 — Contenido** | 2 hubs + 12 guías MX + 8 USA con schema y enlazado | Fase 0 |
| **2 — Conversión** | Auditor sin conexión + primeros benchmarks | Fase 1 |
| **3 — Autoridad** | Observatorio con páginas programáticas + distribución externa | Fase 2 |
| **4 — Escala** | Auditor con OAuth público | Volumen real en 1-3 |

## 12. Riesgos y expectativas

- **Tiempos.** Fases 0-1 se ven en Google en 4-8 semanas. La citación en IA tarda
  **3-6 meses**: depende de reindexación de los modelos y de menciones externas.
  Esto no es un canal de resultados inmediatos.
- **Contenido sin dato propio.** El riesgo principal. Publicar 20 guías genéricas
  produce 20 páginas intercambiables. La regla 2 de la sección 5 es la que sostiene
  toda la estrategia.
- **Privacidad de clientes.** Publicar una celda del observatorio con pocas cuentas
  expone a clientes reales. El mínimo de 5 es un corte duro.
- **Capacidad de servicio.** El embudo genera solicitudes de administración
  mensual; si no hay capacidad operativa para atenderlas, el lead se quema.

## 13. Criterios de éxito

- Fase 0: número de WhatsApp consistente en todo el sitio y botón presente en el 100%
  de las rutas públicas; los 6 crawlers faltantes permitidos.
- Fase 1: las 20 páginas publicadas, cada una con dato propio verificable y schema
  válido.
- Fase 2: el auditor genera conversaciones de WhatsApp medibles.
- Fase 3: aparición de INDEXA en al menos 5 de las 20 preguntas de la batería mensual.
