# Indexación y autoridad de indexaia.com — qué quedó en código y qué falta a mano

Fecha: 2026-10-26. Origen: diagnóstico de Search Console (64 URLs conocidas, 4 indexadas,
51 "Descubierta, sin indexar", 3 "Rastreada, sin indexar", 6 con 404, 178 impresiones en
3 meses, cero backlinks).

## 1. Lo que se verificó antes de tocar nada

| Afirmación del diagnóstico | Resultado real |
|---|---|
| "6 URLs dan 404" | Las 58 URLs del sitemap responden 200. Los 404 son 11 rutas del sitio anterior (`/paginas-web`, `/seo-para-negocios`, `/agencia-digital`, `/automatizacion-de-negocios`, `/automatizacion/*`, `/desarrollo-de-software` y sus versiones `-usa`) y el botón "Ver demo" de las landings de ciudad, que enlazaba `/demo` (no existe). |
| "En la home no hay JSON-LD" | Falso: había Organization, SoftwareApplication, WebPage y FAQPage. Lo que sí había era un `aggregateRating` 4.9/500 sin reseñas reales detrás. |
| "Las FAQ no se renderizan en servidor" | Cierto para las respuestas: el acordeón sólo montaba la respuesta al abrir. Las preguntas sí estaban. |
| "Las 8 páginas de ciudad son ~90% idénticas" | Cierto: misma plantilla, FAQ casi igual y un "testimonio compuesto ficticio" por ciudad. |
| "+340%" y "4.9 de 5" sin fuente | Cierto. Además las seis reseñas de la home y los tres "casos de éxito" eran inventados. |
| `/sitio/terraza-la-estacion` da 404 | Ya responde 200 y está en el directorio: no se tocó. |
| `/logo.png` | Daba 404 desde el principio (lo citaba el schema). |

## 2. Lo que quedó resuelto en el PR

- **301 permanentes** para las 11 rutas viejas, `/demo` y las 7 landings de ciudad fusionadas
  (`src/lib/redireccionesLegacy.ts`, cargado desde `next.config.ts`; test incluido).
- **Landings de ciudad**: se conserva sólo `/pagina-web-cdmx`, ahora con el caso real local y sin
  testimonio ficticio. Las otras siete redirigen a `/servicios/sitios-web-ia`. Si hay clientes
  reales en otra ciudad, se restaura esa página desde git con su caso.
- **Sitemap**: registro en `src/lib/sitemapEstatico.ts` (test: cada ruta existe y ninguna está
  redirigida), sin `/login`, sin `lastModified` de build.
- **`/login`** con `noindex`.
- **Home**: hero y bloque de resultados con las cifras del caso real (`casos-ads.json`), sin
  reseñas inventadas ni `aggregateRating`.
- **`/casos-de-exito`** reconstruida sobre el registro de casos reales.
- **FAQ** renderizada en servidor (colapsada) con `data-faq-answer` para el selector speakable.
- **Schema**: `@graph` con Organization (`#organization`, `alternateName`, teléfono/WhatsApp,
  logo real, áreas MX y USA), WebSite y SoftwareApplication; servicios y guías enlazan la misma
  entidad por `@id`.
- **`public/logo.png`** 512×512 (recorte de la marca del OG image).
- **Títulos**: 22 páginas repetían la marca ("… — INDEXA | INDEXA").
- **Vercel Web Analytics** activado por CLI (`vercel project web-analytics indexa`).

## 3. Lo que sólo puede hacerse a mano (en orden)

### Esta semana

1. **Search Console → Sitemaps**: reenviar `https://indexaia.com/sitemap.xml` después del deploy.
2. **Search Console → Inspección de URL → Solicitar indexación**, una por una (hay cuota diaria;
   si se agota, seguir al día siguiente):
   - `https://indexaia.com/`
   - `https://indexaia.com/administracion-de-campanas`
   - `https://indexaia.com/administracion-de-campanas-usa`
   - `https://indexaia.com/casos-de-exito`
   - `https://indexaia.com/pagina-web-cdmx`
   - `https://indexaia.com/servicios/sitios-web-ia`
   - `https://indexaia.com/agencia-google-ads`
   - `https://indexaia.com/guia/cuanto-gastar-en-google-ads-negocio-local`
   - `https://indexaia.com/guia/administrar-google-ads-yo-mismo-o-contratar`
   - `https://indexaia.com/guia/que-es-roas-cpl-cpc-explicado-simple`
   - `https://indexaia.com/mecanicos-usa` (ya está en posición ~7: el patrón nicho + geo funciona)
3. **Google Business Profile de INDEXA** (categoría "Agencia de publicidad" o "Agencia de
   marketing", CDMX, teléfono 56 1066 9353, sitio indexaia.com). Es el primer backlink, alimenta el
   panel de marca y es lo que ChatGPT/Perplexity consultan para recomendar agencias. Cuando exista,
   añadir su URL a `sameAs` en `src/app/layout.tsx` y, con la dirección real, un `LocalBusiness`.
4. **Enlaces desde los sitios propios** (tecnicoscertificados.com, silenteye.com.mx y cualquier
   otro que INDEXA haya hecho): en el pie de página, texto de marca, sin `nofollow`:

   ```html
   <a href="https://indexaia.com" rel="noopener">Sitio desarrollado por INDEXA</a>
   ```

### Semanas 2–4

5. **Directorios de agencias** (perfil completo, mismo nombre, teléfono y URL que en GBP):
   Clutch, Sortlist, GoodFirms, DesignRush, Bing Places, Apple Business Connect, página de empresa
   en LinkedIn. Si INDEXA tiene certificación de Google Partner, el directorio de Google Partners
   es el más valioso de todos.
6. **Reseñas reales** en Google Business Profile (pedirlas a los clientes actuales de la
   plataforma). Sólo cuando existan tiene sentido volver a mostrar valoraciones en el sitio.
7. **Replicar el patrón de `/mecanicos-usa`** (nicho + geografía poco competida) con guías nuevas
   derivadas del caso real, antes que pelear "agencia de seo" o "agencia de marketing digital".
8. **Marca "indexia"**: `alternateName` ya incluye "Indexa IA" e "indexaia". Si la búsqueda mal
   escrita sigue en posición ~60, la ficha de GBP y los directorios (que consolidan el nombre) son
   lo que la corrige, no el sitio.

## 4. Cómo comprobar que funcionó

- `curl -I https://indexaia.com/paginas-web` → `301` a `/servicios/sitios-web-ia`.
- `curl -s https://indexaia.com/ | grep -c data-faq-answer` → 11 (las respuestas están en el HTML).
- `curl -I https://indexaia.com/logo.png` → `200`.
- `curl -I https://indexaia.com/_vercel/insights/script.js` → `200` (Analytics activo tras el deploy).
- Search Console → Páginas: en 2–4 semanas "Descubierta, sin indexar" debería bajar y
  "No se encuentra (404)" desaparecer.
