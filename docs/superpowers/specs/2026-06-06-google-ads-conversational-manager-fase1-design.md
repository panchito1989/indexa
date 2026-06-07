# Diseño — Google Ads: Gestor Conversacional (Fase 1)

**Fecha:** 2026-06-06
**Estado:** Aprobado en alcance (pendiente de revisión del spec + plan)
**Visión:** que clientes/amigos SIN conocimientos de ads hablen con la IA en su idioma y la IA cree/optimice
campañas por ellos, con confirmación (la IA actúa, pero nada gasta sin OK).
**Fase 1 de 4:** Google Ads (esta). Fase 2 Meta · Fase 3 TikTok (pulir) · Fase 4 modelo por-cliente.
> Absorbe y reemplaza el spec `2026-06-06-google-ads-advanced-segments-design.md` (los segmentos son el módulo "Analizar").

## 1. Objetivo

Un dueño de negocio sin experiencia conversa ("tengo una taquería en Querétaro, $300/día, quiero clientes")
y la IA: **crea** una campaña de búsqueda completa (en PAUSA), la **analiza** por todos los segmentos, y
**aplica** optimizaciones seguras — siempre con confirmación antes de activar o gastar más.

## 2. Alcance (Fase 1)

**Incluye:**
- **Analizar** (lectura): 5 segmentos — hora, dispositivo, ubicación, audiencias, extensiones — en IA + UI.
- **Crear** (escritura, en PAUSA): la IA genera keywords + copy desde la descripción y crea la campaña.
- **Activar** (escritura, con confirmación): pasar de PAUSA a activa solo tras "sí" explícito.
- **Optimizar/Gestionar** (escritura segura): pausar/activar y ajustar presupuesto (ya existen) con reglas de
  confirmación. La IA **recomienda** modificadores de puja desde los segmentos.
- **UX de confirmación**: creación siempre en pausa; activar / subir presupuesto requieren confirmación explícita.

**Fuera (siguientes fases):**
- **Aplicar** modificadores de puja (device/geo/schedule/audience) → Fase 1.5 (en F1 la IA solo los recomienda).
- Meta y TikTok → Fases 2–3. Modelo por-cliente (cada cliente conecta su cuenta) → Fase 4.
- Cambios al dashboard cliente existente.

## 3. Arquitectura y archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| ✏️ | `src/lib/googleAdsClient.ts` | 5 queries de segmentos + tipos (+ resolución de nombres geo). `createFullCampaign` ya existe y crea en PAUSA. Añadir `activateCampaign(customerId, token, campaignResourceName)` (set ENABLED en campaña + ad group + ad) y, si falta, targeting de ubicación dentro de la creación. |
| ✏️ | `src/app/api/google-ads/route.ts` | GET: 5 acciones de segmentos. POST: `create_search_campaign`, `activate_campaign`. |
| ✏️ | `src/app/api/google-ads/ai/route.ts` | Tools nuevas (5 segmentos + `create_search_campaign` + `activate_campaign`) + `executeTool` + **system prompt reescrito** (flujo conversacional no-experto + generación de keywords/copy + confirmación). |
| ✏️ | `src/app/admin/campanas/google-ads/page.tsx` | Pestaña "Segmentos" con sub-vistas (tablas) por segmento. |

Reutiliza `gaqlSearch` / `gaqlMutate` y los patrones existentes.

## 4. Analizar — 5 queries de segmentos (igual que el spec absorbido)

`getHourlyPerformance` (`segments.hour`,`day_of_week`), `getDevicePerformance` (`segments.device`),
`getGeoPerformance` (`geographic_view` + resolución de nombres vía `geo_target_constant`, top 25 por gasto),
`getAudiencePerformance` (`ad_group_audience_view`), `getExtensionPerformance` (`campaign_asset`/assets).
Todas `(customerId, accessToken, dateRange)` → filas tipadas (micros→unidad). Degradación elegante si la API
limita campos en audiencias/extensiones (devolver lo disponible, no fallar). Expuestas como GET y como tools IA.

## 5. Crear — el momento "wow"

**Tool IA `create_search_campaign`** (input generado por la IA):
`{ campaignName, dailyBudget (unidad), finalUrl?, locationName, keywords:[{text,matchType}],
headlines:[string], descriptions:[string] }`.

Flujo:
1. La IA hace **2–3 preguntas simples** (qué vendes / dónde / presupuesto al día / tienes sitio web).
2. La IA **genera** en español: nombre de campaña, 10–15 keywords con match types, 10–15 headlines (≤30 chars),
   3–4 descriptions (≤90 chars).
3. `executeTool` convierte presupuesto→micros y llama `createFullCampaign` (crea budget+campaña+adGroup+keywords
   +RSA, **todo en PAUSA**) + agrega targeting de ubicación (`campaign_criterion` con el `geo_target_constant`
   resuelto desde `locationName`). `finalUrl` = el sitio web del cliente (normalmente su propio sitio Indexa);
   si no tiene, la IA lo pide antes de crear (una campaña de búsqueda requiere URL de destino).
4. La IA responde simple: "Listo, tu campaña está **en pausa**: [presupuesto, ubicación, # keywords, ejemplos de
   anuncio]. ¿La **activo**?".

**Tool IA `activate_campaign`** `{ campaignResourceName }` → `activateCampaign` (ENABLED en campaña+adGroup+ad).
**Solo se llama tras confirmación explícita del usuario.**

## 6. Optimizar / Gestionar (escritura segura)

Tools existentes reutilizadas con reglas de confirmación: `pause_campaign`/`resume_campaign`,
`update_campaign_budget`. La IA usa los **segmentos** para diagnosticar y, cuando recomiende subir presupuesto o
activar, pide confirmación antes de ejecutar. (Aplicar bid modifiers = Fase 1.5.)

## 7. System prompt (reescrito — el cerebro del producto)

- **Rol**: experto en Google Ads que habla **simple**, para dueños de negocio sin conocimientos. Cero jerga;
  si usa un término técnico, lo explica en una línea.
- **Crear**: máximo 2–3 preguntas sencillas; luego genera TODO (keywords/copy) y crea en pausa. No abrumar.
- **Confirmación (CRÍTICO)**: NUNCA activar una campaña ni subir presupuesto sin un "sí" explícito en el chat.
  Crear siempre en PAUSA. Pausar/bajar = puede hacerse directo (no gasta).
- **Optimizar**: usa `get_*_performance` para diagnosticar; entrega diagnóstico simple + acciones; aplica
  pausar/presupuesto con confirmación; **recomienda** modificadores de puja (aplicarlos llega después).
- **Formato**: respuestas cortas, en español, con tablas Markdown solo cuando ayuden. Montos $1,234.56.

## 8. Flujo de datos

```
Crear:    chat → IA (genera keywords/copy) → tool create_search_campaign → createFullCampaign (PAUSA) → "¿activo?"
Activar:  "sí" → tool activate_campaign → ENABLED
Analizar: chat → tools get_*_performance → googleAdsClient → GAQL → diagnóstico
UI:       pestaña Segmentos → GET /api/google-ads?action=hourly|device|geo|audiences|extensions → tablas
```

## 9. Seguridad / errores

- Creación en PAUSA (ya garantizado por `createFullCampaign`). Activar/subir presupuesto = confirmación.
- Sin acciones destructivas (`remove`) desde la IA. Reutiliza rate-limit + sanitización existentes.
- Degradación elegante en segmentos (audiencias/extensiones).

## 10. Testing / verificación

- Sin infra de tests → `next build` (types+lint) + prueba manual end-to-end:
  - "tengo una taquería en Querétaro, $300 al día, sin página" → la IA pregunta lo mínimo, crea campaña en
    pausa, la resume en simple, ofrece activar → "actívala" → queda activa.
  - "¿cómo va y qué optimizo?" → analiza por hora/ubicación/dispositivo + recomienda; aplica presupuesto/pausa
    con confirmación.
  - UI: pestaña "Segmentos" muestra las 5 tablas de la cuenta conectada.

## 11. Decisiones resueltas

1. La IA **actúa con confirmación** (crea en pausa, activa/gasta solo con OK).
2. Fase 1 = **Google Ads completo** (crear + analizar 5 segmentos + gestionar). Aplicar bid modifiers = Fase 1.5.
3. IA **y** UI (pestaña Segmentos).
