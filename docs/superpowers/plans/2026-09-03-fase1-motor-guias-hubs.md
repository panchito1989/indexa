# Fase 1 — Motor de guías, casos y hubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor que sirve el cluster de contenido de administración de campañas — casos de éxito anonimizados con cifras reales de las cuentas administradas, un registro de guías dirigido por datos, la ruta dinámica que las renderiza con schema, y los dos hubs comerciales.

**Architecture:** Los casos de éxito viven en `src/data/casos-ads.json` (capturados a mano desde la exportación nativa de Google Ads, siempre anónimos, con la definición de conversión explícita) y se leen desde un módulo tipado que las guías consumen; el test del módulo impide cifras inconsistentes o identificables. Las guías viven en un registro (`src/lib/guiasAdsData.ts`) y se renderizan desde `/guia/[slug]`, siguiendo el patrón que el proyecto ya usa en `/servicios/[slug]`. El sitemap y `llms.txt` se generan desde el registro, no a mano.

**Tech Stack:** Next.js 16 (App Router, `generateStaticParams`), React 19, TypeScript 5, Tailwind 4, vitest 3, Firestore (Admin SDK), Google Ads API vía `src/lib/googleAdsClient.ts`.

> **⚠️ Estado (2026-09-04):** la Task 1 ya corrió contra producción y dio **0 celdas
> viables** (2 cuentas con Google Ads, 1 de 28 sitios con categoría/ciudad). Según el
> spec §14, el "dato propio" pasa de benchmarks agregados a **casos de éxito con cifras
> reales** exportadas del panel admin (CSV por campaña). Por tanto:
> - **Task 1**: hecha (`scripts/benchmarks-viability.mjs`, commit en PR #41).
> - **Task 2** fue **reescrita**: módulo de casos de éxito (`src/lib/casosAds.ts`) en vez
>   de benchmarks. Las Tasks 3, 5 y 8 ya apuntan a casos. Ver spec §14 y §14.1.
> - El observatorio (benchmarks agregados) queda para un plan posterior, cuando existan las
>   exportaciones de las 7 cuentas administradas.
> - **Ejecutado (2026-09-04):** Tasks 2, 3 y 4 commiteadas (`845b971`, `8d3763c`, `5e9d1ec`)
>   con estos ajustes salidos de las revisiones: `validarGuia()` en el registro concentra las
>   reglas del spec §5 y el test las prueba con fixtures buenos y malos (`b70c7ee`); un
>   placeholder desconocido en `plantilla` falla el test; `buscarGuia` devuelve `null` como
>   `buscarCaso`; `casosAds.test.ts` también exige `tasaContacto ≈ contactos/clics`; en
>   `guiaSchemas.ts` los `"@type"` de nivel superior llevan `as const` (exigencia de `strict`
>   para que `.find()` estreche el tipo; sin efecto en el JSON emitido).
> - **Ejecutado (2026-09-04, tarde):** Tasks 5, 6 y 7 commiteadas (`c4bed16`, `4aaa3a5`,
>   `f6c44f9`). Ajustes de revisión: `src/lib/jsonLd.ts` (`jsonLdHtml()` escapa `<>&` al
>   inyectar JSON-LD — un `</script>` en una FAQ rompía la página) y `src/lib/datoPropio.ts`
>   (`renderDatoPropio` fuera de la página, con una sola pasada regex: `replace()` sólo
>   sustituía la primera aparición) en `243c88f`; `guiaSchemas.ts` con Organization por `@id`
>   e `image` (`15f82c3`). **Hallazgos al verificar en el navegador:** el middleware hacía
>   `startsWith("/admin")` y mandaba `/administracion-de-campanas` al login del panel →
>   `bajoPrefijo()` en `src/lib/rutas.ts`, usado por el middleware y el flotante (`b0f955d`);
>   la imagen OG del sitio se llamaba `og-image.png.png` → renombrada (`d2b…` ver git log).
>   Ambos hubs verificados en `next dev`: cargan, frontera de precio verbatim, cifras del caso
>   desde el módulo, flotante visible. Cerrado en `81e13cc` + `aff07a8`: `<title>` sin sufijo
>   duplicado, `jsonLdHtml()` en ambos hubs, `lastModified` honesto en el sitemap (fecha fija
>   para los hubs, `actualizado` para las guías) y la línea USA de `llms.txt` sin ambigüedad
>   de precio. Falta la Task 8 (guías semilla), a la espera de la validación del caso.

**Alcance:** Este plan cubre el **motor y los cimientos de datos** de la Fase 1 del spec `docs/superpowers/specs/2026-09-03-seo-geo-administracion-campanas-design.md`, más **4 guías semilla** que lo prueban de extremo a extremo. Las 16 guías restantes (8 MX + 8 USA) son producción de contenido y van en un plan aparte, una vez que la Task 1 diga qué datos existen realmente.

---

## Por qué la Task 1 va primero

El spec exige **un dato propio por página** y un mínimo de **5 cuentas por celda** antes de publicar un benchmark. Nadie sabe todavía cuántas cuentas conectadas caen en cada `(industria, ciudad)`.

Si resulta que sólo hay 3 talleres en Monterrey, esa guía no puede llevar su dato y el diseño del cluster cambia — habría que agregar por industria a nivel nacional, o por rangos de inversión, en vez de por ciudad. **Escribir 20 guías antes de saberlo es construir sobre una suposición.** Por eso la primera tarea no produce contenido: produce el reporte que dice qué se puede afirmar.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `scripts/benchmarks-viability.mjs` (nuevo) | Reporte de viabilidad: cuántas cuentas hay por celda y cuáles cruzan el mínimo. No escribe nada. |
| `src/data/casos-ads.json` (nuevo) | Casos de éxito anonimizados con cifras reales de las cuentas administradas, capturados a mano desde la exportación de Google Ads. |
| `src/lib/casosAds.ts` (nuevo) | Lectura tipada de `casos-ads.json`, búsqueda por slug, formato de pesos. |
| `src/lib/casosAds.test.ts` (nuevo) | Contrato: todo caso es anónimo, sus cifras son consistentes y no trae datos identificables. |
| `src/lib/guiasAdsData.ts` (nuevo) | Registro de las guías del cluster: slug, metadatos SEO, respuesta directa, secciones, FAQ, dato propio. |
| `src/lib/guiasAdsData.test.ts` (nuevo) | Invariantes del registro: slugs únicos, campos obligatorios, sin choque con las guías estáticas. |
| `src/lib/guiaSchemas.ts` (nuevo) | Constructores de JSON-LD (`Article`, `FAQPage`, `BreadcrumbList`) para una guía. |
| `src/lib/guiaSchemas.test.ts` (nuevo) | Forma del schema generado. |
| `src/app/guia/[slug]/page.tsx` (nuevo) | Renderiza una guía del registro. `generateStaticParams` + `generateMetadata`. |
| `src/app/administracion-de-campanas/page.tsx` (nuevo) | Hub comercial MX. |
| `src/app/administracion-de-campanas-usa/page.tsx` (nuevo) | Hub comercial USA-Hispano. |
| `src/app/sitemap.ts` (modificar) | Incluye las guías del registro y los dos hubs. |
| `public/llms.txt` (modificar) | Índice del cluster nuevo, ahora que las páginas existen. |

---

## Task 1: Reporte de viabilidad de benchmarks

**Files:**
- Create: `scripts/benchmarks-viability.mjs`

Este script **no escribe nada** y no publica nada. Sólo responde: ¿hay datos suficientes para el cluster que diseñamos?

- [ ] **Step 1: Escribir el script**

Crear `scripts/benchmarks-viability.mjs`:

```js
/**
 * Reporte de viabilidad de benchmarks — NO escribe nada, sólo mide.
 *
 * Cruza: usuarios con Google Ads conectado → su sitio (categoria, ciudad)
 * → cuántas cuentas caen en cada celda.
 *
 * Uso: node scripts/benchmarks-viability.mjs
 * Requiere las mismas env vars que la app (FIREBASE_SERVICE_ACCOUNT_KEY).
 */
import "dotenv/config";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/** Mínimo de cuentas por celda para poder publicar el dato (spec §8.2). */
const MIN_CUENTAS = 5;

function db() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_KEY");
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getFirestore();
}

function normaliza(valor) {
  return (valor || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

async function main() {
  const firestore = db();

  const usuarios = await firestore.collection("usuarios").get();
  const conAds = usuarios.docs.filter((d) => d.get("googleAdsCustomerId"));

  const sitios = await firestore.collection("sitios").get();
  const sitioPorUid = new Map();
  for (const s of sitios.docs) {
    const uid = s.get("uid") || s.get("ownerUid");
    if (uid) sitioPorUid.set(uid, { categoria: s.get("categoria"), ciudad: s.get("ciudad") });
  }

  const celdas = new Map();
  let sinSitio = 0;
  let sinCategoriaOCiudad = 0;

  for (const u of conAds) {
    const sitio = sitioPorUid.get(u.id);
    if (!sitio) { sinSitio++; continue; }
    if (!sitio.categoria || !sitio.ciudad) { sinCategoriaOCiudad++; continue; }

    const clave = `${normaliza(sitio.categoria)} | ${normaliza(sitio.ciudad)}`;
    celdas.set(clave, (celdas.get(clave) || 0) + 1);
  }

  const orden = [...celdas.entries()].sort((a, b) => b[1] - a[1]);
  const viables = orden.filter(([, n]) => n >= MIN_CUENTAS);

  console.log(`\nUsuarios totales:            ${usuarios.size}`);
  console.log(`Con Google Ads conectado:    ${conAds.length}`);
  console.log(`  · sin sitio asociado:      ${sinSitio}`);
  console.log(`  · sin categoria o ciudad:  ${sinCategoriaOCiudad}`);
  console.log(`\nCeldas (categoria | ciudad): ${celdas.size}`);
  console.log(`Celdas con >= ${MIN_CUENTAS} cuentas:    ${viables.length}\n`);

  if (orden.length === 0) {
    console.log("No hay ninguna celda. El cluster no puede llevar datos por celda todavía.");
  } else {
    console.log("Detalle (todas las celdas, mayor a menor):");
    for (const [clave, n] of orden) {
      console.log(`  ${n >= MIN_CUENTAS ? "✓" : " "} ${String(n).padStart(3)}  ${clave}`);
    }
  }

  // Agregado alternativo por si el corte por ciudad no alcanza.
  const porIndustria = new Map();
  for (const [clave, n] of celdas) {
    const industria = clave.split(" | ")[0];
    porIndustria.set(industria, (porIndustria.get(industria) || 0) + n);
  }
  const industriasViables = [...porIndustria.entries()]
    .filter(([, n]) => n >= MIN_CUENTAS)
    .sort((a, b) => b[1] - a[1]);

  console.log(`\nSi agregamos SOLO por industria (sin ciudad):`);
  console.log(`Industrias con >= ${MIN_CUENTAS} cuentas: ${industriasViables.length}`);
  for (const [industria, n] of industriasViables) {
    console.log(`  ✓ ${String(n).padStart(3)}  ${industria}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("Falló el reporte:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Correrlo**

Run: `npx dotenv -e .env.local -- node scripts/benchmarks-viability.mjs`

(El proyecto ya tiene `dotenv-cli` como devDependency. Si las credenciales viven en otro archivo, ajustar `-e`.)

Expected: el reporte impreso. **No hay salida "correcta" predefinida** — el objetivo es descubrir el número real.

- [ ] **Step 3: DECISIÓN — parar y reportar**

Este es un punto de control, no un paso mecánico. Según el resultado:

- **≥ 3 celdas `(industria, ciudad)` viables** → seguir con el plan tal cual. Las guías llevan dato por ciudad.
- **0-2 celdas viables, pero ≥ 3 industrias viables sin cortar por ciudad** → el cluster cambia: los datos se afirman por industria a nivel nacional ("los talleres mecánicos que administramos", sin ciudad). Reportar al controlador ANTES de seguir; el registro de guías y el copy cambian.
- **Ni industrias viables** → el pilar de "dato propio" no se sostiene todavía. **PARAR y escalar.** Publicar 20 guías sin dato propio es exactamente lo que el spec §12 marca como el riesgo principal. Hay que replantear con el usuario (p. ej. arrancar el cluster con menos guías y datos de fuentes públicas citadas, mientras la base de cuentas crece).

No continúes a la Task 2 sin reportar el resultado de este paso.

- [ ] **Step 4: Commit**

```bash
git add scripts/benchmarks-viability.mjs
git commit -m "feat: reporte de viabilidad de benchmarks por industria y ciudad"
```

---

## Task 2: Módulo de casos de éxito

**Files:**
- Create: `src/data/casos-ads.json`
- Create: `src/lib/casosAds.ts`
- Test: `src/lib/casosAds.test.ts`

Reemplaza al módulo de benchmarks (spec §14). Un caso es **una cuenta real, anonimizada**,
con cifras tomadas de la exportación nativa de Google Ads. No hay mínimo de muestra
porque no es una estadística agregada: es una historia individual con consentimiento.

**Reglas que el test hace cumplir:**
- `anonimo: true` siempre, y ningún campo `nombre`, `customerId` ni `dominio`.
- Las conversiones se llaman **`contactos`** (clic a WhatsApp o llamada), nunca ventas.
- `costoPorContacto` debe coincidir con `inversion / contactos` (±2%): si alguien edita
  una cifra a mano y no la otra, el test lo atrapa.
- `definicionConversion` obligatoria: es lo que evita publicar "97 clientes".

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/casosAds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buscarCaso, casos, formatoMXN } from "./casosAds";

const PROHIBIDOS = ["nombre", "customerId", "customer", "dominio", "telefono", "email"];

describe("casos de exito de ads", () => {
  it("hay al menos un caso", () => {
    expect(casos().length).toBeGreaterThan(0);
  });

  it("todo caso es anonimo y no trae datos identificables", () => {
    for (const c of casos()) {
      expect(c.anonimo).toBe(true);
      for (const campo of PROHIBIDOS) {
        expect(Object.keys(c)).not.toContain(campo);
      }
    }
  });

  it("las cifras son consistentes entre si", () => {
    for (const c of casos()) {
      const esperado = c.metricas.inversion / c.metricas.contactos;
      const desvio = Math.abs(c.metricas.costoPorContacto - esperado) / esperado;
      expect(desvio).toBeLessThan(0.02);
      expect(c.metricas.contactos).toBeGreaterThan(0);
      expect(c.metricas.clics).toBeGreaterThanOrEqual(c.metricas.contactos);
    }
  });

  it("declara que es una conversion y en que periodo", () => {
    for (const c of casos()) {
      expect(c.definicionConversion.length).toBeGreaterThan(10);
      expect(c.periodo.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.periodo.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.periodo.desde < c.periodo.hasta).toBe(true);
    }
  });

  it("busca por slug y devuelve null si no existe", () => {
    const primero = casos()[0];
    expect(buscarCaso(primero.slug)?.slug).toBe(primero.slug);
    expect(buscarCaso("no-existe")).toBeNull();
  });

  it("formatea pesos sin decimales", () => {
    expect(formatoMXN(159)).toBe("$159 MXN");
    expect(formatoMXN(15414.3)).toBe("$15,414 MXN");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/casosAds.test.ts`
Expected: FAIL — no existe `./casosAds`.

- [ ] **Step 3: Crear el archivo de datos con el primer caso**

Crear `src/data/casos-ads.json` (cifras del borrador
`docs/superpowers/casos/2026-09-04-centro-servicio-electrodomesticos-cdmx.md`):

```json
{
  "casos": [
    {
      "slug": "centro-servicio-electrodomesticos-cdmx",
      "mercado": "mx",
      "industria": "Centro de servicio de electrodomésticos y pantallas",
      "ciudad": "CDMX y Estado de México",
      "anonimo": true,
      "relacionDesde": "2025",
      "fuente": "Exportación de Google Ads, 2026-09-04",
      "definicionConversion": "Clic al botón de WhatsApp o llamada telefónica desde el anuncio",
      "periodo": { "desde": "2026-08-01", "hasta": "2026-08-31" },
      "comparacion": { "desde": "2026-07-23", "hasta": "2026-07-31" },
      "metricas": {
        "inversion": 15414,
        "contactos": 97,
        "costoPorContacto": 159,
        "clics": 249,
        "tasaContacto": 39.0,
        "cuotaImpresiones": 33.75
      },
      "metricasComparacion": {
        "inversion": 3778,
        "contactos": 11,
        "costoPorContacto": 343,
        "clics": 105,
        "tasaContacto": 10.5
      },
      "destacados": [
        "La campaña principal bajó el costo por contacto de $343 a $206 MXN.",
        "La campaña de televisores genera contactos a $24 MXN.",
        "El 86% de la inversión llega desde móvil.",
        "33.75% de cuota de impresiones, por encima de los fabricantes presentes en la subasta.",
        "Los lunes concentran el volumen: el aparato se descompone el fin de semana y se busca el lunes."
      ]
    }
  ]
}
```

- [ ] **Step 4: Escribir el módulo**

Crear `src/lib/casosAds.ts`:

```ts
import datos from "@/data/casos-ads.json";

export interface CasoMetricas {
  /** MXN, sin decimales. */
  inversion: number;
  /** Clics a WhatsApp + llamadas. NUNCA "clientes" ni "ventas". */
  contactos: number;
  /** inversion / contactos, redondeado. El test exige consistencia. */
  costoPorContacto: number;
  clics: number;
  /** contactos / clics × 100. */
  tasaContacto: number;
  /** Porcentaje de cuota de impresiones, si la exportación lo trae. */
  cuotaImpresiones?: number;
}

export interface CasoAds {
  slug: string;
  mercado: "mx" | "usa";
  industria: string;
  ciudad: string;
  /** Siempre true: se publica sin nombre ni identificadores. */
  anonimo: true;
  relacionDesde: string;
  fuente: string;
  definicionConversion: string;
  periodo: { desde: string; hasta: string };
  comparacion?: { desde: string; hasta: string };
  metricas: CasoMetricas;
  metricasComparacion?: CasoMetricas;
  destacados: string[];
}

const archivo = datos as { casos: CasoAds[] };

export function casos(): CasoAds[] {
  return archivo.casos;
}

export function buscarCaso(slug: string): CasoAds | null {
  return archivo.casos.find((c) => c.slug === slug) ?? null;
}

/** "$159 MXN" — sin decimales, con separador de miles. */
export function formatoMXN(monto: number): string {
  return `$${Math.round(monto).toLocaleString("en-US")} MXN`;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/casosAds.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/casos-ads.json src/lib/casosAds.ts src/lib/casosAds.test.ts
git commit -m "feat: modulo de casos de exito anonimizados con cifras reales"
```

---

## Task 3: Registro de guías

**Files:**
- Create: `src/lib/guiasAdsData.ts`
- Test: `src/lib/guiasAdsData.test.ts`

Las 16 guías estáticas que ya existen bajo `src/app/guia/*/page.tsx` **no se tocan**. Next da prioridad a las rutas estáticas sobre la dinámica, así que conviven; el test lo verifica.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/guiasAdsData.test.ts`:

```ts
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guiasAds } from "./guiasAdsData";

const GUIA_DIR = path.resolve(__dirname, "..", "app", "guia");

describe("guiasAds", () => {
  it("no hay slugs repetidos", () => {
    const slugs = guiasAds.map((g) => g.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
  });

  it("ningun slug choca con una guia estatica existente", () => {
    const estaticas = readdirSync(GUIA_DIR).filter((e) =>
      statSync(path.join(GUIA_DIR, e)).isDirectory() && !e.startsWith("[")
    );
    const chocan = guiasAds.filter((g) => estaticas.includes(g.slug));
    expect(chocan.map((g) => g.slug)).toEqual([]);
  });

  it("toda guia trae los campos obligatorios", () => {
    for (const g of guiasAds) {
      expect(g.slug).toMatch(/^[a-z0-9-]+$/);
      expect(g.seoTitle.length).toBeGreaterThan(20);
      expect(g.seoDescription.length).toBeGreaterThan(80);
      expect(g.h1.length).toBeGreaterThan(10);
      expect(g.secciones.length).toBeGreaterThan(0);
      expect(g.faq.length).toBeGreaterThanOrEqual(3);
      expect(g.actualizado).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("la respuesta directa es autocontenida y citable", () => {
    for (const g of guiasAds) {
      const palabras = g.respuestaDirecta.trim().split(/\s+/).length;
      // Regla 1 del spec §5: 40-60 palabras, completa por sí sola.
      expect(palabras).toBeGreaterThanOrEqual(35);
      expect(palabras).toBeLessThanOrEqual(70);
      expect(g.respuestaDirecta).not.toMatch(/en este art[íi]culo|a continuaci[óo]n|veremos/i);
    }
  });

  it("toda guia declara que caso respalda su dato propio", () => {
    for (const g of guiasAds) {
      expect(g.datoPropio.caso.length).toBeGreaterThan(0);
      expect(g.datoPropio.plantilla).toMatch(/\{(inversion|contactos|costoPorContacto|tasaContacto)\}/);
    }
  });

  it("cada guia enlaza a su hub y a guias hermanas", () => {
    const slugs = new Set(guiasAds.map((g) => g.slug));
    for (const g of guiasAds) {
      expect(["mx", "usa"]).toContain(g.mercado);
      for (const hermana of g.hermanas) {
        expect(slugs.has(hermana)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/guiasAdsData.test.ts`
Expected: FAIL — no existe `./guiasAdsData`.

- [ ] **Step 3: Escribir los tipos y el registro vacío**

Crear `src/lib/guiasAdsData.ts`:

```ts
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
  /** Párrafos. Markdown mínimo: sólo **negritas** y saltos de línea. */
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
   * Frase que envuelve las cifras. Placeholders: `{inversion}`, `{contactos}`,
   * `{costoPorContacto}`, `{tasaContacto}`, `{industria}`, `{ciudad}`.
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

export const guiasAds: GuiaAds[] = [];

export function buscarGuia(slug: string): GuiaAds | undefined {
  return guiasAds.find((g) => g.slug === slug);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/guiasAdsData.test.ts`
Expected: PASS, 6 tests (vacuos con el registro vacío — el contrato queda fijado antes del contenido).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guiasAdsData.ts src/lib/guiasAdsData.test.ts
git commit -m "feat: registro tipado del cluster de guias de ads"
```

---

## Task 4: Constructores de schema

**Files:**
- Create: `src/lib/guiaSchemas.ts`
- Test: `src/lib/guiaSchemas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/guiaSchemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GuiaAds } from "./guiasAdsData";
import { buildGuiaGraph } from "./guiaSchemas";

const guia: GuiaAds = {
  slug: "por-que-mi-campana-de-google-ads-no-vende",
  mercado: "mx",
  familia: "diagnostico",
  seoTitle: "Por qué mi campaña de Google Ads no vende (y cómo saber la causa)",
  seoDescription:
    "Las cuatro causas reales por las que una campaña de Google Ads gasta sin generar ventas, cómo distinguirlas con datos de tu propia cuenta, y qué hacer con cada una.",
  h1: "Por qué mi campaña de Google Ads no vende",
  respuestaDirecta:
    "Una campaña de Google Ads que gasta sin vender casi siempre falla por una de cuatro causas: las conversiones no están bien medidas, las palabras clave atraen a quien no compra, la página de destino no convierte, o el presupuesto se reparte entre demasiadas campañas. Se distinguen revisando cuatro números concretos de tu cuenta.",
  secciones: [
    { titulo: "¿Cómo sé cuál de las cuatro es mi caso?", parrafos: ["..."] },
  ],
  faq: [
    { pregunta: "¿Cuánto tarda en dar resultados?", respuesta: "..." },
    { pregunta: "¿Pausar la campaña ayuda?", respuesta: "..." },
    { pregunta: "¿Conviene subir el presupuesto?", respuesta: "..." },
  ],
  datoPropio: { caso: "centro-servicio-electrodomesticos-cdmx", plantilla: "{contactos} contactos" },
  hermanas: [],
  casoExito: null,
  actualizado: "2026-09",
};

describe("buildGuiaGraph", () => {
  const graph = buildGuiaGraph(guia, "https://indexaia.com");
  const tipos = graph["@graph"].map((n) => n["@type"]);

  it("incluye Article, FAQPage y BreadcrumbList", () => {
    expect(tipos).toContain("Article");
    expect(tipos).toContain("FAQPage");
    expect(tipos).toContain("BreadcrumbList");
  });

  it("el Article lleva fechas y autor", () => {
    const article = graph["@graph"].find((n) => n["@type"] === "Article");
    expect(article.datePublished).toMatch(/^\d{4}-\d{2}/);
    expect(article.dateModified).toMatch(/^\d{4}-\d{2}/);
    expect(article.author.name).toBe("INDEXA");
    expect(article.mainEntityOfPage).toBe(
      "https://indexaia.com/guia/por-que-mi-campana-de-google-ads-no-vende"
    );
  });

  it("el FAQPage trae una Question por cada FAQ", () => {
    const faq = graph["@graph"].find((n) => n["@type"] === "FAQPage");
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0]["@type"]).toBe("Question");
    expect(faq.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });

  it("el breadcrumb va INDEXA > Guias > la guia", () => {
    const bc = graph["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    expect(bc.itemListElement).toHaveLength(3);
    expect(bc.itemListElement[2].name).toBe(guia.h1);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/guiaSchemas.test.ts`
Expected: FAIL — no existe `./guiaSchemas`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/guiaSchemas.ts`:

```ts
import type { GuiaAds } from "./guiasAdsData";

/** JSON-LD de una guía: Article + FAQPage + BreadcrumbList en un @graph. */
export function buildGuiaGraph(guia: GuiaAds, siteUrl: string) {
  const url = `${siteUrl}/guia/${guia.slug}`;
  const fecha = `${guia.actualizado}-01`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guia.h1,
        description: guia.seoDescription,
        author: { "@type": "Organization", name: "INDEXA", url: siteUrl },
        publisher: { "@type": "Organization", name: "INDEXA", url: siteUrl },
        datePublished: fecha,
        dateModified: fecha,
        mainEntityOfPage: url,
        inLanguage: guia.mercado === "usa" ? "es-US" : "es-MX",
      },
      {
        "@type": "FAQPage",
        mainEntity: guia.faq.map((f) => ({
          "@type": "Question",
          name: f.pregunta,
          acceptedAnswer: { "@type": "Answer", text: f.respuesta },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "INDEXA", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Guías", item: `${siteUrl}/guia` },
          { "@type": "ListItem", position: 3, name: guia.h1 },
        ],
      },
    ],
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/guiaSchemas.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/guiaSchemas.ts src/lib/guiaSchemas.test.ts
git commit -m "feat: constructores de JSON-LD para las guias del cluster"
```

---

## Task 5: Ruta dinámica `/guia/[slug]`

**Files:**
- Create: `src/app/guia/[slug]/page.tsx`

- [ ] **Step 1: Escribir la página**

Crear `src/app/guia/[slug]/page.tsx`, siguiendo el patrón de `src/app/servicios/[slug]/page.tsx` (léelo antes: define el orden `generateStaticParams` → `generateMetadata` → componente, y el uso de `notFound()`):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { buscarCaso, formatoMXN } from "@/lib/casosAds";
import { buscarGuia, guiasAds } from "@/lib/guiasAdsData";
import { buildGuiaGraph } from "@/lib/guiaSchemas";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return guiasAds.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guia = buscarGuia(slug);
  if (!guia) return {};

  return {
    title: guia.seoTitle,
    description: guia.seoDescription,
    alternates: { canonical: `/guia/${guia.slug}` },
    openGraph: {
      type: "article",
      title: guia.seoTitle,
      description: guia.seoDescription,
      url: `${SITE_URL}/guia/${guia.slug}`,
      locale: guia.mercado === "usa" ? "es_US" : "es_MX",
    },
  };
}

/** Sustituye los placeholders con las cifras del caso. Sin caso, no hay bloque. */
function renderDatoPropio(guia: NonNullable<ReturnType<typeof buscarGuia>>): { texto: string; nota: string } | null {
  const caso = buscarCaso(guia.datoPropio.caso);
  if (!caso) return null; // nunca se inventa una cifra

  const m = caso.metricas;
  const texto = guia.datoPropio.plantilla
    .replace("{inversion}", formatoMXN(m.inversion))
    .replace("{contactos}", String(m.contactos))
    .replace("{costoPorContacto}", formatoMXN(m.costoPorContacto))
    .replace("{tasaContacto}", `${m.tasaContacto.toFixed(0)}%`)
    .replace("{industria}", caso.industria.toLowerCase())
    .replace("{ciudad}", caso.ciudad);

  const nota = `Cuenta real administrada por INDEXA, anonimizada. Periodo ${caso.periodo.desde} a ${caso.periodo.hasta}. Contacto = ${caso.definicionConversion.toLowerCase()}. Fuente: ${caso.fuente}.`;
  return { texto, nota };
}

export default async function GuiaAdsPage({ params }: PageProps) {
  const { slug } = await params;
  const guia = buscarGuia(slug);
  if (!guia) notFound();

  const dato = renderDatoPropio(guia);
  const hub = guia.mercado === "usa"
    ? "/administracion-de-campanas-usa"
    : "/administracion-de-campanas";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildGuiaGraph(guia, SITE_URL)) }}
      />
      <Header />

      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/guia" className="hover:text-indexa-orange">Guías</Link>
          <span className="mx-2">/</span>
          <span>{guia.h1}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{guia.h1}</h1>

        <p className="mt-3 text-sm text-gray-500">
          Actualizado: {guia.actualizado}
        </p>

        {/* Respuesta directa — el bloque que un modelo debe poder citar solo. */}
        <p className="mt-6 rounded-xl bg-gray-50 p-5 text-lg leading-relaxed text-gray-800">
          {guia.respuestaDirecta}
        </p>

        {dato && (
          <aside className="mt-6 rounded-xl border-l-4 border-indexa-orange bg-orange-50/60 p-5">
            <p className="text-gray-800">{dato.texto}</p>
            <p className="mt-2 text-xs text-gray-500">{dato.nota}</p>
          </aside>
        )}

        {guia.secciones.map((seccion) => (
          <section key={seccion.titulo} className="mt-10">
            <h2 className="text-2xl font-semibold text-gray-900">{seccion.titulo}</h2>
            {seccion.parrafos.map((p, i) => (
              <p key={i} className="mt-4 leading-relaxed text-gray-700">{p}</p>
            ))}
            {seccion.pasos && (
              <ol className="mt-4 list-decimal space-y-2 pl-6 text-gray-700">
                {seccion.pasos.map((paso, i) => <li key={i}>{paso}</li>)}
              </ol>
            )}
            {seccion.tabla && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {seccion.tabla.encabezados.map((h) => (
                        <th key={h} className="border-b p-2 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {seccion.tabla.filas.map((fila, i) => (
                      <tr key={i}>
                        {fila.map((celda, j) => (
                          <td key={j} className="border-b p-2">{celda}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-gray-900">Preguntas frecuentes</h2>
          <dl className="mt-4 space-y-6">
            {guia.faq.map((f) => (
              <div key={f.pregunta}>
                <dt className="font-semibold text-gray-900">{f.pregunta}</dt>
                <dd className="mt-1 text-gray-700">{f.respuesta}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 rounded-2xl bg-[#050816] p-8 text-white">
          <h2 className="text-2xl font-semibold">¿Prefieres que lo hagamos nosotros?</h2>
          <p className="mt-3 text-gray-300">
            La plataforma INDEXA son $699 MXN/mes y te da las herramientas para
            hacerlo tú con IA. Que nosotros operemos tus campañas día a día se
            cotiza según tu inversión, partiendo de ahí.
          </p>
          <Link
            href={hub}
            className="mt-5 inline-block rounded-xl bg-indexa-orange px-6 py-3 font-semibold"
          >
            Ver cómo funciona la administración
          </Link>
          {guia.casoExito && (
            <p className="mt-4 text-sm text-gray-400">
              <Link href={`/casos-de-exito#${guia.casoExito}`} className="underline">
                Ver el caso de un negocio de esta industria
              </Link>
            </p>
          )}
        </section>

        {guia.hermanas.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900">Sigue leyendo</h2>
            <ul className="mt-3 space-y-2">
              {guia.hermanas.map((slugHermana) => {
                const hermana = buscarGuia(slugHermana);
                if (!hermana) return null;
                return (
                  <li key={slugHermana}>
                    <Link href={`/guia/${slugHermana}`} className="text-indexa-orange hover:underline">
                      {hermana.h1}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </article>

      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Verificar que las guías estáticas siguen ganando**

Run: `npm run build`

Expected: build exitoso. En la salida, confirmar que `/guia/seo-local-mexico` (estática existente) sigue apareciendo como su propia ruta `○`, y que `/guia/[slug]` aparece como `●` (SSG con `generateStaticParams`). Con el registro vacío, `[slug]` genera 0 páginas — es correcto.

- [ ] **Step 3: Commit**

```bash
git add "src/app/guia/[slug]/page.tsx"
git commit -m "feat: ruta dinamica que renderiza las guias del registro"
```

---

## Task 6: Los dos hubs comerciales

**Files:**
- Create: `src/app/administracion-de-campanas/page.tsx`
- Create: `src/app/administracion-de-campanas-usa/page.tsx`

Estas son las páginas de destino de todo el cluster. Copia la estructura visual de `src/app/agencia-google-ads/page.tsx` (léela primero) para mantener consistencia con las pillar pages existentes.

**Contenido obligatorio de cada hub:**

1. **H1** — MX: "Administramos tus campañas de Google, Meta y TikTok Ads". USA: "Manejamos tus anuncios para que tú no tengas que aprender".
2. **Respuesta directa** en los primeros 60 palabras, citable sola, que diga qué es el servicio y para quién.
3. **La frontera comercial, explícita** (spec, "Decisiones tomadas"): la plataforma son $699 MXN/mes y te da las herramientas para hacerlo tú con IA; que INDEXA opere la cuenta día a día es un servicio aparte que se cotiza según la inversión y se define en la asesoría. **No inventar una cifra para el servicio administrado.**
4. **Qué incluye la administración**, en lista: estructura de campañas, presupuestos y pujas, creativos, medición de conversiones, optimización continua, reporte mensual.
5. **Para quién es**, nombrando el dolor: ya gastaste sin resultados; no sabes qué es un ROAS; no tienes tiempo de aprender la plataforma.
6. **FAQ de al menos 5 preguntas**, con `FAQPage` schema.
7. **Enlaces a las guías** del mercado correspondiente (leer de `guiasAds` filtrando por `mercado`, no a mano).
8. **JSON-LD `Service`** con `provider`, `areaServed` y `offers` — usando el `Offer` de `src/lib/pricing.ts` para la plataforma, y declarando el servicio administrado sin precio.
9. **CTA a WhatsApp** usando `whatsappUrl()` de `src/lib/contact.ts`, con mensaje precargado distinto por mercado.

- [ ] **Step 1: Escribir el hub MX**
- [ ] **Step 2: Escribir el hub USA** (español-US, precios USD, ciudades Houston / Dallas / Miami / Phoenix / Atlanta)
- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: ambas rutas aparecen como estáticas `○`.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/administracion-de-campanas/page.tsx src/app/administracion-de-campanas-usa/page.tsx
git commit -m "feat: hubs comerciales de administracion de campanas MX y USA"
```

---

## Task 7: Sitemap y `llms.txt` desde el registro

**Files:**
- Modify: `src/app/sitemap.ts`
- Modify: `public/llms.txt`

Hoy las 16 guías estáticas se registran **a mano** en el sitemap, una por una. Las nuevas no: se derivan del registro, que es lo que evita que se desincronicen.

- [ ] **Step 1: Sitemap**

En `src/app/sitemap.ts`, agregar el import:

```ts
import { guiasAds } from "@/lib/guiasAdsData";
```

y dentro del array `staticPages`, junto al bloque de `servicios.map`, agregar:

```ts
    // Hubs de administración de campañas — destino comercial del cluster
    { url: `${SITE_URL}/administracion-de-campanas`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 1.0 },
    { url: `${SITE_URL}/administracion-de-campanas-usa`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 1.0 },
    // Cluster de guías de ads — derivadas del registro, nunca a mano
    ...guiasAds.map((g) => ({
      url: `${SITE_URL}/guia/${g.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.85,
    })),
```

- [ ] **Step 2: `llms.txt`**

Ahora que las páginas existen, agregar a `public/llms.txt`, dentro de `## Páginas principales`, una sección nueva **antes** de `### Servicios detallados`:

```markdown
### Administración de campañas publicitarias
- [/administracion-de-campanas](https://indexaia.com/administracion-de-campanas): Servicio done-for-you en México — INDEXA opera Google Ads, Meta Ads y TikTok Ads del cliente. Se cotiza según la inversión publicitaria.
- [/administracion-de-campanas-usa](https://indexaia.com/administracion-de-campanas-usa): El mismo servicio para negocios hispanos en Estados Unidos, en español, con precios en USD.
```

Y las guías nuevas al final de `### Guías y comparativas`, una línea por guía publicada, con el mismo formato que las existentes.

**Sólo listar guías que existan en el registro.** Anunciar una URL que da 404 es peor que no anunciarla (misma regla que en la Fase 0).

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: exitoso.

Run: `npx vitest run`
Expected: toda la suite en verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/sitemap.ts public/llms.txt
git commit -m "feat: sitemap y llms.txt derivan el cluster del registro"
```

---

## Task 8: Cuatro guías semilla

**Files:**
- Modify: `src/lib/guiasAdsData.ts`

Cuatro guías MX, una por familia, que prueban el motor completo. Las 16 restantes van en el plan siguiente.

**Cada guía apunta su `datoPropio` a un caso que exista en `src/data/casos-ads.json`.** Hoy hay uno (`centro-servicio-electrodomesticos-cdmx`). Si una guía necesita una cifra que ese caso no tiene, díselo al controlador en vez de forzar la plantilla — el dato tiene que corresponder al tema de la guía.

Las cuatro, con su brief:

| Slug | Familia | Pregunta que responde | Cifra del caso que usa |
|---|---|---|---|
| `por-que-mi-campana-de-google-ads-no-vende` | diagnóstico | ¿Por qué gasto y no vendo? Las cuatro causas, cómo distinguirlas con números de la propia cuenta | 39% de clics que terminan en contacto; segmentación por servicio |
| `cuanto-gastar-en-google-ads-negocio-local` | presupuesto | ¿Cuánto presupuesto necesito para que funcione? Piso realista por industria y qué esperar de cada rango | $15,414 → 97 contactos, $159 cada uno |
| `administrar-google-ads-yo-mismo-o-contratar` | decisión | ¿Me conviene aprender o que alguien me lo maneje? Costo real en horas vs. costo del servicio | Costo por contacto $343 → $206 tras la reestructura |
| `que-es-roas-cpl-cpc-explicado-simple` | traducción | ¿Qué significan estas siglas? Cada una con la cifra real de referencia | $159 / $206 / $24 como CPL reales para explicar la sigla |

**Requisitos por guía** (los verifica el test de la Task 3):

- `respuestaDirecta` de 40-60 palabras, autocontenida, sin "en este artículo".
- Al menos 3 secciones cuyo `titulo` sea una pregunta literal.
- Al menos 3 entradas de FAQ.
- `hermanas` apuntando a 2 de las otras tres.
- `casoExito` con el ancla del caso de esa industria en `/casos-de-exito`, o `null` si no hay caso publicado. **Léela primero**: abre `src/app/casos-de-exito/page.tsx` y comprueba qué anclas existen de verdad; un ancla inventada produce un enlace roto.
- `actualizado: "2026-09"`.
- `datoPropio.plantilla` que use al menos un placeholder (`{inversion}`, `{contactos}`, `{costoPorContacto}`, `{tasaContacto}`) y llame a las conversiones **contactos**.

Ejemplo de `datoPropio` bien formado:

```ts
  datoPropio: {
    caso: "centro-servicio-electrodomesticos-cdmx",
    plantilla:
      "En agosto de 2026, un {industria} en {ciudad} que administramos invirtió {inversion} y recibió {contactos} contactos por WhatsApp y llamada: {costoPorContacto} por contacto, con {tasaContacto} de los clics terminando en un mensaje.",
  },
```

- [ ] **Step 1: Escribir las cuatro entradas en `guiasAds`**
- [ ] **Step 2: Verificar**

Run: `npx vitest run src/lib/guiasAdsData.test.ts`
Expected: PASS — ahora con contenido real, los tests dejan de ser vacuos.

Run: `npm run build`
Expected: `/guia/[slug]` genera 4 páginas.

- [ ] **Step 3: Revisar las páginas renderizadas**

Levantar el preview y abrir las cuatro rutas. Confirmar: la respuesta directa se ve en el primer bloque, el dato propio aparece con su metodología, la FAQ se renderiza, y el CTA lleva al hub correcto.

- [ ] **Step 4: Validar el schema**

Copiar el JSON-LD de una guía y pegarlo en el Rich Results Test de Google. Debe reconocer `Article` y `FAQPage` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guiasAdsData.ts
git commit -m "feat: cuatro guias semilla del cluster de administracion de campanas"
```

---

## Criterios de aceptación de la Fase 1

- El reporte de viabilidad corre y dice cuántas celdas tienen datos suficientes.
- Todo caso en `src/data/casos-ads.json` es anónimo y sus cifras son consistentes (lo exige el test).
- Ninguna guía muestra una cifra inventada: sin caso, el bloque de dato propio se omite.
- Las 16 guías estáticas anteriores siguen sirviéndose igual que antes.
- `/guia/[slug]` genera las 4 guías semilla como estáticas.
- Los dos hubs existen, declaran la frontera de precio y no inventan cifra para el servicio administrado.
- Sitemap y `llms.txt` listan el cluster, y ninguna URL anunciada da 404.
- `npm test`, `npx tsc --noEmit` y `npm run build` en verde.
