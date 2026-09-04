# Fase 0 — Higiene SEO+GEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el sitio con un único número de WhatsApp (`525610669353`) accesible desde toda ruta pública, con todos los crawlers de IA permitidos y con `llms.txt` describiendo administración de campañas como servicio.

**Architecture:** Se centraliza el contacto en `src/lib/contact.ts` (punto único de verdad) y la clasificación de rutas en `src/lib/publicRoutes.ts`. `WhatsAppFloat` se vuelve consciente de la ruta y se monta una sola vez en el layout raíz, eliminando 12 montajes duplicados. `robots.ts` pasa de rules escritas a mano a una lista de crawlers mapeada, lo que hace imposible olvidar un agente.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, vitest 3 (nuevo, sólo para `src/lib` y `src/app/robots.ts`).

**Alcance:** Este plan cubre **sólo la Fase 0** del spec `docs/superpowers/specs/2026-09-03-seo-geo-administracion-campanas-design.md`. La Fase 1 (motor de guías, 2 hubs, 20 guías) va en un plan aparte porque es un subsistema independiente con su propio ciclo de verificación.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/contact.ts` (nuevo) | Número de WhatsApp y constructor de enlaces `wa.me`. Único lugar donde vive el número. |
| `src/lib/contact.test.ts` (nuevo) | Tests del número y del constructor de enlaces. |
| `src/lib/publicRoutes.ts` (nuevo) | Decide si una ruta es pública (muestra el botón flotante) o privada. |
| `src/lib/publicRoutes.test.ts` (nuevo) | Tests de clasificación de rutas, incluido el caso `/administracion-de-campanas`. |
| `src/lib/emailTemplates.test.ts` (nuevo) | Regresión: el correo de prospección nunca vuelve a llevar el número placeholder. |
| `src/app/robots.test.ts` (nuevo) | Verifica que los 10 crawlers de IA están permitidos y que ninguna ruta privada se expone. |
| `src/components/WhatsAppFloat.tsx` (modificar) | Deja de hardcodear el número; se oculta solo en rutas privadas. |
| `src/components/ContactForm.tsx` (modificar) | Usa `whatsappUrl()` en vez del número literal. |
| `src/lib/emailTemplates.ts` (modificar) | Usa la constante compartida; se elimina el default falso. |
| `src/app/layout.tsx` (modificar) | Monta `WhatsAppFloat` una sola vez. |
| `src/app/robots.ts` (modificar) | Crawlers de IA generados desde una lista. |
| `public/llms.txt` (modificar) | Administración de campañas como servicio; número de contacto corregido. |
| `vitest.config.ts` (nuevo) | Configuración del runner con alias `@/`. |
| `package.json` (modificar) | Dependencia y scripts de test. |

---

## Task 1: Infraestructura de tests

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Crear la configuración**

Crear `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Agregar los scripts**

En `package.json`, dentro de `"scripts"`, agregar estas dos entradas después de `"lint": "eslint"`:

```json
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
```

- [ ] **Step 4: Verificar que el runner arranca**

Run: `npm test`
Expected: exit 0, con el mensaje `No test files found, exiting with code 0`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: agregar vitest para la logica pura de src/lib"
```

---

## Task 2: Punto único de verdad del contacto

**Files:**
- Create: `src/lib/contact.ts`
- Test: `src/lib/contact.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/contact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WHATSAPP_NUMBER, whatsappUrl } from "./contact";

describe("WHATSAPP_NUMBER", () => {
  it("es el numero de INDEXA con lada de pais y sin simbolos", () => {
    expect(WHATSAPP_NUMBER).toBe("525610669353");
  });
});

describe("whatsappUrl", () => {
  it("arma un enlace wa.me con el mensaje codificado", () => {
    expect(whatsappUrl("Hola, ¿cuánto cuesta?")).toBe(
      "https://wa.me/525610669353?text=Hola%2C%20%C2%BFcu%C3%A1nto%20cuesta%3F"
    );
  });

  it("funciona sin mensaje", () => {
    expect(whatsappUrl("")).toBe("https://wa.me/525610669353?text=");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/contact.test.ts`
Expected: FAIL con `Failed to resolve import "./contact"`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/contact.ts`:

```ts
/**
 * Punto único de verdad del contacto de INDEXA.
 *
 * El número se puede sobreescribir con NEXT_PUBLIC_WHATSAPP_NUMBER en Vercel,
 * pero el default es el número REAL: un despliegue sin la env var no debe
 * mandar leads a un número inexistente.
 */
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "525610669353";

/** Enlace wa.me con el mensaje ya codificado. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/contact.test.ts`
Expected: PASS, 3 tests

Si falla porque `WHATSAPP_NUMBER` trae otro valor, es que tienes `NEXT_PUBLIC_WHATSAPP_NUMBER` exportada en tu shell. Quítala: vitest no carga `.env`, así que el único origen posible es el ambiente.

- [ ] **Step 5: Quitar `--passWithNoTests`**

Ya existe el primer test, así que la bandera deja de ser necesaria y pasa a ser un
riesgo: si el glob de descubrimiento se rompe, CI seguiría pasando en verde.

En `package.json`, cambiar:

```json
    "test": "vitest run --passWithNoTests",
```

por:

```json
    "test": "vitest run",
```

Run: `npm test`
Expected: PASS, 3 tests. Si en vez de eso sale `No test files found` con exit 1,
el glob de `vitest.config.ts` no está encontrando el archivo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contact.ts src/lib/contact.test.ts package.json
git commit -m "feat: constante unica de WhatsApp con constructor de enlaces"
```

---

## Task 3: Migrar los tres consumidores del número

**Files:**
- Modify: `src/lib/emailTemplates.ts:5` y `:19`
- Modify: `src/components/ContactForm.tsx:94`
- Modify: `src/components/WhatsAppFloat.tsx:5` y `:23`
- Test: `src/lib/emailTemplates.test.ts`

Hoy el número aparece en tres lugares con **tres valores distintos**: `525622042820` en `WhatsAppFloat` y `ContactForm`, y el placeholder falso `5215512345678` como default en `emailTemplates`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/emailTemplates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getProspectEmailHtml } from "./emailTemplates";

describe("getProspectEmailHtml", () => {
  const html = getProspectEmailHtml({
    businessName: "Taller Ruiz",
    city: "Monterrey",
    demoUrl: "https://indexaia.com/sitio/taller-ruiz",
  });

  it("apunta al numero oficial de INDEXA", () => {
    expect(html).toContain("https://wa.me/525610669353");
  });

  it("no contiene el numero placeholder que se enviaba por default", () => {
    expect(html).not.toContain("5215512345678");
  });

  it("no contiene el numero viejo", () => {
    expect(html).not.toContain("525622042820");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/emailTemplates.test.ts`
Expected: FAIL en `apunta al numero oficial de INDEXA` — el HTML trae `wa.me/5215512345678`

- [ ] **Step 3: Migrar `emailTemplates.ts`**

Reemplazar la línea 5:

```ts
const INDEXA_WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5215512345678";
```

por un import al inicio del archivo (después del comentario de cabecera):

```ts
import { WHATSAPP_NUMBER } from "./contact";
```

y sustituir el uso en la línea 19:

```ts
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, vi la propuesta de INDEXA para ${businessName} y quiero ver los detalles.`)}`;
```

Buscar cualquier otro uso de `INDEXA_WHATSAPP` en el archivo y reemplazarlo por `WHATSAPP_NUMBER`:

```bash
grep -n "INDEXA_WHATSAPP" src/lib/emailTemplates.ts
```

Expected después del cambio: sin resultados.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/emailTemplates.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Migrar `ContactForm.tsx`**

Agregar el import junto a los demás del archivo:

```tsx
import { whatsappUrl } from "@/lib/contact";
```

Reemplazar la línea 94:

```tsx
      window.open(`https://wa.me/525622042820?text=${encodeURIComponent(waMsg)}`, "_blank");
```

por:

```tsx
      window.open(whatsappUrl(waMsg), "_blank");
```

- [ ] **Step 6: Migrar `WhatsAppFloat.tsx`**

Eliminar la línea 5 (`const PHONE = "525622042820";`) y agregar el import:

```tsx
import { whatsappUrl } from "@/lib/contact";
```

Reemplazar el `href` de la línea 23:

```tsx
        href={`https://wa.me/${PHONE}?text=${encodeURIComponent("Hola Isaac, vengo del sitio de INDEXA y quiero información de los servicios para mi negocio.")}`}
```

por:

```tsx
        href={whatsappUrl(
          "Hola Isaac, vengo del sitio de INDEXA y quiero información de los servicios para mi negocio."
        )}
```

- [ ] **Step 7: Medir cuánto falta**

Run: `grep -rn "5622042820\|5215512345678" src/ --include="*.tsx" --include="*.ts" | grep -v "\.test\.ts"`

Expected: **22 coincidencias en 15 archivos** fuera de los tres migrados aquí. No es un error:
el número está regado por `src/app/` y se limpia en la Task 3b. Registrar la salida y seguir.

- [ ] **Step 8: Commit**

```bash
git add src/lib/emailTemplates.ts src/lib/emailTemplates.test.ts src/components/ContactForm.tsx src/components/WhatsAppFloat.tsx
git commit -m "fix: unificar el numero de WhatsApp en los tres consumidores"
```

---

## Task 3b: Migrar los 15 archivos restantes de `src/app/`

**Files:**
- Modify (default falso `5215512345678`): `src/app/api/contact/route.ts:153`, `src/app/api/contact-b2b/route.ts:154`, `src/app/dashboard/ayuda/page.tsx:49`, `src/app/mantenimiento/page.tsx:8`, `src/app/demo/[slug]/page.tsx:318`
- Modify (enlaces `wa.me/525622042820` hardcodeados): `src/app/agencias/page.tsx:414`, `src/app/api/cancel-survey/route.ts:47`, `src/app/dashboard/trial-expirado/page.tsx:137`, `src/app/guia/preguntas-frecuentes/page.tsx:331`, `src/app/usa/page.tsx:294,489,570`, `src/app/construccion-usa/page.tsx:176,346`, `src/app/landscaping-usa/page.tsx:177,360`, `src/app/limpieza-usa/page.tsx:176,350`, `src/app/mecanicos-usa/page.tsx:178,358`, `src/app/plomeros-usa/page.tsx:176,345`
- Test: `src/lib/contactUsage.test.ts`

La Task 3 sólo cubría `src/lib` y `src/components`. El barrido completo encontró 22
usos más en `src/app/`. Cinco de ellos repiten el default falso `5215512345678`, que
es el mismo bug de los correos: `/api/contact` y `/api/contact-b2b` mandan al cliente
a un número inexistente si la env var no está puesta.

**Regla de edición:** los enlaces hardcodeados traen el mensaje ya percent-encoded en
el query string. **No decodificar ni reescribir esos mensajes** — sustituir únicamente
el número, dejando el `?text=...` intacto. Reescribirlos a mano cambiaría silenciosamente
el texto que sale hacia los clientes.

- [ ] **Step 1: Escribir el test de regresión que falla**

Crear `src/lib/contactUsage.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Números que quedaron obsoletos y no deben reaparecer en el código. */
const FORBIDDEN = ["5622042820", "5215512345678"];

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || entry.endsWith(".test.ts")) return [];
    return [full];
  });
}

describe("uso del numero de contacto", () => {
  it("ningun archivo fuente contiene un numero de WhatsApp obsoleto", () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const content = readFileSync(file, "utf8");
      return FORBIDDEN.some((number) => content.includes(number));
    });

    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/contactUsage.test.ts`
Expected: FAIL, listando los 15 archivos infractores.

- [ ] **Step 3: Migrar los 5 defaults falsos**

En cada uno de estos archivos, reemplazar el literal `"5215512345678"` por la constante
compartida.

`src/app/api/contact/route.ts:153` y `src/app/api/contact-b2b/route.ts:154`, que hoy dicen:

```ts
    const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5215512345678";
```

pasan a usar el import (agregar `import { WHATSAPP_NUMBER } from "@/lib/contact";` arriba)
y la línea queda:

```ts
    const waNumber = WHATSAPP_NUMBER;
```

`src/app/dashboard/ayuda/page.tsx:49`:

```ts
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5215512345678";
```

pasa a:

```ts
import { WHATSAPP_NUMBER } from "@/lib/contact";

const SUPPORT_WHATSAPP = WHATSAPP_NUMBER;
```

`src/app/mantenimiento/page.tsx:8`:

```ts
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5215512345678";
```

pasa a un re-export directo del módulo compartido — eliminar la constante local y agregar:

```ts
import { WHATSAPP_NUMBER } from "@/lib/contact";
```

(el resto del archivo ya usa el identificador `WHATSAPP_NUMBER`, así que no hay más cambios).

`src/app/demo/[slug]/page.tsx:318` — dentro del `href`, reemplazar
`${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5215512345678"}` por `${WHATSAPP_NUMBER}`
y agregar el import.

- [ ] **Step 4: Migrar los enlaces hardcodeados**

En los 10 archivos restantes, cada ocurrencia de la cadena literal:

```
https://wa.me/525622042820
```

se convierte en una plantilla que interpola la constante, **conservando el resto de la
URL exactamente como está**. Ejemplo real, `src/app/plomeros-usa/page.tsx:176`:

Antes:

```tsx
                  href="https://wa.me/525622042820?text=Hola%2C%20soy%20plomero%20y%20quiero%20m%C3%A1s%20clientes"
```

Después:

```tsx
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola%2C%20soy%20plomero%20y%20quiero%20m%C3%A1s%20clientes`}
```

Agregar `import { WHATSAPP_NUMBER } from "@/lib/contact";` en cada archivo que lo necesite.

Caso especial `src/app/api/cancel-survey/route.ts:47`: el enlace vive dentro de un string
de HTML para correo, no en JSX. Ahí la sustitución es dentro del template literal existente:
`https://wa.me/${WHATSAPP_NUMBER}`.

Caso especial `src/app/usa/page.tsx:489`: el enlace no trae `?text=`, sólo el número.

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/contactUsage.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: exit 0, sin salida.

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/contactUsage.test.ts src/app/
git commit -m "fix: migrar los 15 archivos restantes al numero unico de WhatsApp"
```

---

## Task 4: Clasificación de rutas públicas

**Files:**
- Create: `src/lib/publicRoutes.ts`
- Test: `src/lib/publicRoutes.test.ts`

**Por qué importa:** el hub nuevo del spec es `/administracion-de-campanas`, que **empieza con la cadena `/admin`**. Un filtro de prefijos ingenuo escondería el botón de WhatsApp justo en la página comercial más importante del proyecto. El test lo cubre explícitamente.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/publicRoutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./publicRoutes";

describe("isPublicRoute", () => {
  it("acepta la home", () => {
    expect(isPublicRoute("/")).toBe(true);
  });

  it("acepta las guias", () => {
    expect(isPublicRoute("/guia/seo-local-mexico")).toBe(true);
  });

  it("acepta /administracion-de-campanas aunque empiece con /admin", () => {
    expect(isPublicRoute("/administracion-de-campanas")).toBe(true);
    expect(isPublicRoute("/administracion-de-campanas-usa")).toBe(true);
  });

  it("rechaza el panel de admin y sus subrutas", () => {
    expect(isPublicRoute("/admin")).toBe(false);
    expect(isPublicRoute("/admin/dashboard")).toBe(false);
  });

  it("rechaza agency y dashboard", () => {
    expect(isPublicRoute("/agency/dashboard")).toBe(false);
    expect(isPublicRoute("/dashboard")).toBe(false);
  });

  it("rechaza login y registro", () => {
    expect(isPublicRoute("/login")).toBe(false);
    expect(isPublicRoute("/registro")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/publicRoutes.test.ts`
Expected: FAIL con `Failed to resolve import "./publicRoutes"`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/publicRoutes.ts`:

```ts
/**
 * Rutas donde NO se muestra el botón flotante de WhatsApp: paneles internos y
 * pantallas de autenticación.
 *
 * La comparación exige coincidencia exacta o un "/" después del prefijo. Sin
 * eso, "/administracion-de-campanas" quedaría clasificada como privada por
 * empezar con "/admin".
 */
const PRIVATE_PREFIXES = ["/admin", "/agency", "/dashboard", "/login", "/registro"];

export function isPublicRoute(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/publicRoutes.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/publicRoutes.ts src/lib/publicRoutes.test.ts
git commit -m "feat: clasificacion de rutas publicas para el boton flotante"
```

---

## Task 5: Botón flotante en toda ruta pública

**Files:**
- Modify: `src/components/WhatsAppFloat.tsx`
- Modify: `src/app/layout.tsx:160-162`
- Modify (eliminar montajes): `src/app/page.tsx`, `src/app/usa/page.tsx`, `src/app/agencia-de-marketing-digital/page.tsx`, `src/app/agencia-de-publicidad/page.tsx`, `src/app/agencia-de-seo/page.tsx`, `src/app/agencia-google-ads/page.tsx`, `src/app/construccion-usa/page.tsx`, `src/app/landscaping-usa/page.tsx`, `src/app/limpieza-usa/page.tsx`, `src/app/mecanicos-usa/page.tsx`, `src/app/plomeros-usa/page.tsx`, `src/app/servicios/[slug]/page.tsx`

Hoy el componente se monta a mano en 12 páginas y falta en las 16 guías de `/guia/`, en `/casos-de-exito`, en las landings `pagina-web-*` y `sitio-web-*`, en `/directorio` y en `/demo` — justo donde va a caer el tráfico del cluster nuevo.

- [ ] **Step 1: Hacer el componente consciente de la ruta**

En `src/components/WhatsAppFloat.tsx`, agregar a los imports:

```tsx
import { usePathname } from "next/navigation";
import { isPublicRoute } from "@/lib/publicRoutes";
```

Y como primera instrucción dentro del componente, antes del `return`:

```tsx
  const pathname = usePathname();
  if (!isPublicRoute(pathname)) return null;
```

Cuidado con el orden de hooks: `usePathname()` y `useState` deben ejecutarse **antes** del `return null`. El archivo ya llama `useState(true)` en la primera línea del componente; deja el `useState` arriba y pon el `usePathname` inmediatamente después, con el `return null` debajo de ambos.

- [ ] **Step 2: Montarlo una sola vez en el layout raíz**

En `src/app/layout.tsx`, agregar el import junto a los existentes:

```tsx
import WhatsAppFloat from "@/components/WhatsAppFloat";
```

y cambiar el `<body>`:

```tsx
      <body className={`${inter.variable} antialiased`}>
        {children}
        <WhatsAppFloat />
      </body>
```

- [ ] **Step 3: Eliminar los 12 montajes duplicados**

En cada uno de los 12 archivos listados arriba, borrar la línea `<WhatsAppFloat />` y su `import` correspondiente.

Localizarlos con:

```bash
grep -rn "WhatsAppFloat" src/app/
```

Expected después del cambio: sólo aparece en `src/app/layout.tsx` (import y montaje).

- [ ] **Step 4: Verificar que compila y que el botón aparece donde debe**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos.

Run: `npm run dev` y revisar en el navegador:
- `http://localhost:3000/guia/seo-local-mexico` → el botón aparece (antes no estaba)
- `http://localhost:3000/casos-de-exito` → el botón aparece
- `http://localhost:3000/admin/login` → el botón NO aparece
- El enlace del botón apunta a `wa.me/525610669353`

- [ ] **Step 5: Commit**

```bash
git add src/components/WhatsAppFloat.tsx src/app/layout.tsx src/app/page.tsx src/app/usa/page.tsx src/app/agencia-de-marketing-digital/page.tsx src/app/agencia-de-publicidad/page.tsx src/app/agencia-de-seo/page.tsx src/app/agencia-google-ads/page.tsx src/app/construccion-usa/page.tsx src/app/landscaping-usa/page.tsx src/app/limpieza-usa/page.tsx src/app/mecanicos-usa/page.tsx src/app/plomeros-usa/page.tsx "src/app/servicios/[slug]/page.tsx"
git commit -m "feat: boton de WhatsApp en toda ruta publica desde el layout raiz"
```

---

## Task 5b: No pisar el botón de los sitios de clientes

**Files:**
- Rename: `src/lib/publicRoutes.ts` → `src/lib/whatsappFloatRoutes.ts`
- Rename: `src/lib/publicRoutes.test.ts` → `src/lib/whatsappFloatRoutes.test.ts`
- Modify: `src/components/WhatsAppFloat.tsx`

**El bug:** `/sitio/[slug]` son los sitios web generados para los clientes. Ya montan
su propio botón de WhatsApp — `src/app/sitio/[slug]/WhatsAppButton.tsx` — en la misma
posición exacta (`fixed bottom-6 right-6 z-50`), con el número **del cliente**, que
además cuenta clics en Firestore (`clicsWhatsApp`) y dispara la conversión de Google Ads
vía `indexaReportLead()`.

Tras la Task 5, el flotante de INDEXA se monta encima: dos botones superpuestos, y el
número de INDEXA sobre el sitio del cliente. Un visitante del cliente que toque el
botón equivocado le escribe a INDEXA en vez de al negocio, sin registrar la conversión.

**El nombre también quedó mal:** `isPublicRoute` afirma algo que ya no es cierto —
`/sitio/x` **es** una ruta pública, simplemente no debe mostrar el flotante de INDEXA.
El predicado responde otra pregunta, y su nombre debe decirlo.

- [ ] **Step 1: Renombrar los archivos conservando el historial**

```bash
git mv src/lib/publicRoutes.ts src/lib/whatsappFloatRoutes.ts
git mv src/lib/publicRoutes.test.ts src/lib/whatsappFloatRoutes.test.ts
```

- [ ] **Step 2: Escribir el test que falla**

Reemplazar el contenido completo de `src/lib/whatsappFloatRoutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { showsWhatsAppFloat } from "./whatsappFloatRoutes";

describe("showsWhatsAppFloat", () => {
  it("acepta la home", () => {
    expect(showsWhatsAppFloat("/")).toBe(true);
  });

  it("acepta las guias", () => {
    expect(showsWhatsAppFloat("/guia/seo-local-mexico")).toBe(true);
  });

  it("acepta /administracion-de-campanas aunque empiece con /admin", () => {
    expect(showsWhatsAppFloat("/administracion-de-campanas")).toBe(true);
    expect(showsWhatsAppFloat("/administracion-de-campanas-usa")).toBe(true);
  });

  it("rechaza el panel de admin y sus subrutas", () => {
    expect(showsWhatsAppFloat("/admin")).toBe(false);
    expect(showsWhatsAppFloat("/admin/dashboard")).toBe(false);
  });

  it("rechaza agency y dashboard", () => {
    expect(showsWhatsAppFloat("/agency/dashboard")).toBe(false);
    expect(showsWhatsAppFloat("/dashboard")).toBe(false);
  });

  it("rechaza login y registro", () => {
    expect(showsWhatsAppFloat("/login")).toBe(false);
    expect(showsWhatsAppFloat("/registro")).toBe(false);
  });

  it("rechaza los sitios de clientes, que traen su propio boton", () => {
    expect(showsWhatsAppFloat("/sitio/taller-ruiz")).toBe(false);
    expect(showsWhatsAppFloat("/sitio")).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/whatsappFloatRoutes.test.ts`
Expected: FAIL — no existe el export `showsWhatsAppFloat`.

- [ ] **Step 4: Escribir la implementación**

Reemplazar el contenido completo de `src/lib/whatsappFloatRoutes.ts`:

```ts
/**
 * ¿Se muestra el botón flotante de WhatsApp de INDEXA en esta ruta?
 *
 * Se oculta en dos casos distintos:
 *   1. Paneles internos y pantallas de autenticación, donde no pinta nada.
 *   2. `/sitio/*` — los sitios generados para clientes, que montan su propio
 *      botón con el número DEL CLIENTE y su propio conteo de conversiones.
 *      Superponer el de INDEXA le robaría los leads al cliente.
 *
 * La comparación exige coincidencia exacta o un "/" después del prefijo. Sin
 * eso, "/administracion-de-campanas" quedaría oculta por empezar con "/admin".
 */
const HIDDEN_PREFIXES = [
  "/admin",
  "/agency",
  "/dashboard",
  "/login",
  "/registro",
  "/sitio",
];

export function showsWhatsAppFloat(pathname: string): boolean {
  return !HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
```

- [ ] **Step 5: Actualizar el consumidor**

En `src/components/WhatsAppFloat.tsx`, cambiar el import y la llamada:

```tsx
import { showsWhatsAppFloat } from "@/lib/whatsappFloatRoutes";
```

y el guard queda:

```tsx
  if (!pathname || !showsWhatsAppFloat(pathname)) return null;
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `npx vitest run`
Expected: PASS, 14 tests en 4 archivos.

- [ ] **Step 7: Verificar que no quedan referencias al nombre viejo**

Run: `grep -rn "publicRoutes\|isPublicRoute" src/`
Expected: sin resultados.

- [ ] **Step 8: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: exit 0, sin salida.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 9: Commit**

```bash
git add src/lib/whatsappFloatRoutes.ts src/lib/whatsappFloatRoutes.test.ts src/components/WhatsAppFloat.tsx
git commit -m "fix: no montar el flotante de INDEXA sobre los sitios de clientes"
```

---

## Task 6: Crawlers de IA faltantes en robots.txt

**Files:**
- Modify: `src/app/robots.ts`
- Test: `src/app/robots.test.ts`

`GPTBot` y `ClaudeBot` sirven para entrenamiento. Los que traen la respuesta cuando alguien pregunta en vivo son `OAI-SearchBot`, `ChatGPT-User`, `Claude-User` y `Claude-SearchBot`, y hoy no están declarados. Faltan también `CCBot` y `meta-externalagent`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/app/robots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import robots from "./robots";

const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "meta-externalagent",
];

function declaredAgents(): string[] {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  return list.flatMap((rule) =>
    Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent ?? ""]
  );
}

describe("robots", () => {
  it("declara los 10 crawlers de IA", () => {
    const agents = declaredAgents();
    for (const agent of AI_AGENTS) {
      expect(agents).toContain(agent);
    }
  });

  it("bloquea las rutas privadas en toda regla", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    for (const rule of list) {
      const disallow = Array.isArray(rule.disallow)
        ? rule.disallow
        : [rule.disallow ?? ""];
      expect(disallow).toContain("/admin/");
      expect(disallow).toContain("/api/");
      expect(disallow).toContain("/agency/");
      expect(disallow).toContain("/dashboard/");
    }
  });

  it("publica el sitemap", () => {
    expect(robots().sitemap).toBe("https://indexaia.com/sitemap.xml");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/app/robots.test.ts`
Expected: FAIL en `declara los 10 crawlers de IA` — falta `OAI-SearchBot`

- [ ] **Step 3: Escribir la implementación**

Reemplazar el contenido completo de `src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

/** Nunca indexable: paneles internos y API. */
const PRIVATE_PATHS = ["/admin/", "/agency/", "/dashboard/", "/api/"];

/**
 * Crawlers de IA permitidos.
 *
 * GPTBot y ClaudeBot son de entrenamiento; OAI-SearchBot, ChatGPT-User,
 * Claude-User y Claude-SearchBot son los que consultan en vivo cuando un
 * usuario pregunta. Sin estos últimos no aparecemos en las respuestas.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sitio/", "/demo/", "/login", "/registro"],
        disallow: PRIVATE_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ["/", "/sitio/", "/llms.txt"],
        disallow: PRIVATE_PATHS,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/app/robots.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Verificar la salida real**

Run: `npm run dev` y en otra terminal:

```bash
curl -s http://localhost:3000/robots.txt | grep -c "User-Agent"
```

Expected: `11` (la regla `*` más los 10 crawlers de IA)

- [ ] **Step 6: Commit**

```bash
git add src/app/robots.ts src/app/robots.test.ts
git commit -m "feat: permitir los crawlers de busqueda en vivo de ChatGPT y Claude"
```

---

## Task 7: `llms.txt` con administración de campañas

**Files:**
- Modify: `public/llms.txt:16-26` (sección "Servicios principales")
- Modify: `public/llms.txt:109-114` (sección "Contacto")

**Importante:** en esta fase **no** se agregan a `llms.txt` las URLs de los hubs ni de las guías nuevas — todavía no existen y anunciar 404s a los modelos es peor que no anunciar nada. Esas entradas se agregan en el plan de la Fase 1, cuando las páginas estén publicadas.

- [ ] **Step 1: Reescribir la sección de servicios**

En `public/llms.txt`, reemplazar el bloque que empieza en la línea 16 (`## Servicios principales`) hasta la línea anterior a `## Planes y precios`, por:

```markdown
## Servicios principales

- **Administración de campañas publicitarias** — INDEXA opera las cuentas de Google Ads, Meta Ads y TikTok Ads del cliente de principio a fin: estructura de campañas, presupuestos, pujas, creativos, medición de conversiones y optimización continua. Está dirigido a dueños de negocio que no saben operar estas plataformas o que ya gastaron dinero sin resultados. El cliente no necesita aprender nada ni tener conocimientos previos de publicidad digital.
- **Auditoría de cuentas publicitarias** — Diagnóstico de una cuenta de Google Ads o Meta Ads existente: detecta conversiones mal configuradas, Performance Max sin exclusiones de marca, términos de búsqueda irrelevantes y presupuesto desperdiciado, comparado contra los costos reales por industria y ciudad que INDEXA mide en las cuentas que administra.
- **Sitios web con IA** — Páginas web profesionales generadas en menos de 3 minutos, optimizadas para conversión y SEO local
- **Google Ads** — Campañas en Search, Maps, Display, YouTube y Performance Max optimizadas por IA
- **Meta Ads** — Anuncios en Facebook e Instagram segmentados por ZIP, edad e intereses
- **TikTok Ads** — Publicidad nativa para alcance joven
- **SEO local** — Posicionamiento en Google Maps, Google Business Profile, schema.org, citaciones y reseñas automatizadas
- **Chatbot inteligente** — Atención 24/7, calificación de leads y agendamiento automático
- **WhatsApp Business** — Integración nativa con la API oficial de Meta para que los leads lleguen al celular del dueño
- **Automatizaciones** — Email marketing, SMS, retargeting y workflows multi-canal
- **Analíticas en tiempo real** — Dashboard con costo por lead, ROAS, conversiones y reportes mensuales en video
```

- [ ] **Step 2: Corregir el número de contacto**

En la sección `### Contacto`, reemplazar:

```markdown
- WhatsApp: +52 55 5622 0428 (México) — atención en español
```

por:

```markdown
- WhatsApp: +52 56 1066 9353 (México y USA-Hispano) — atención en español
```

- [ ] **Step 3: Verificar que no queda rastro del número viejo**

Run: `grep -rn "5622 0428\|5622042820\|5215512345678" public/ src/`
Expected: sin resultados.

- [ ] **Step 4: Verificar que se sirve correctamente**

Run: `npm run dev` y en otra terminal:

```bash
curl -s http://localhost:3000/llms.txt | grep -A2 "Administración de campañas"
```

Expected: el párrafo de administración de campañas, completo.

- [ ] **Step 5: Commit**

```bash
git add public/llms.txt
git commit -m "docs: llms.txt declara administracion de campanas y el numero correcto"
```

---

## Task 8: Verificación completa y variable de entorno

**Files:** ninguno (verificación)

- [ ] **Step 1: Correr toda la suite**

Run: `npm test`
Expected: PASS, 18 tests en 5 archivos — `contact` (3), `emailTemplates` (3),
`contactUsage` (2), `whatsappFloatRoutes` (7), `robots` (3)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build exitoso. Confirmar en la salida que `/robots.txt` y las rutas públicas siguen generándose como estáticas (`○` o `●`), no como dinámicas (`ƒ`).

- [ ] **Step 4: Poner la variable de entorno en Vercel**

En el proyecto de Vercel, agregar `NEXT_PUBLIC_WHATSAPP_NUMBER = 525610669353` en Production, Preview y Development.

No es estrictamente necesario porque el default del código ya es el número real, pero deja el número gestionable sin tocar código.

- [ ] **Step 5: Commit final si quedó algo suelto**

```bash
git status --short
```

Expected: limpio salvo `next.config.ts`, que trae cambios previos ajenos a este plan y no debe committearse aquí.

---

## Criterios de aceptación de la Fase 0

- `grep -rn "5622042820\|5215512345678" src/ public/` no devuelve nada.
- `curl -s https://indexaia.com/robots.txt | grep -c "User-Agent"` devuelve `11` después del despliegue.
- El botón de WhatsApp aparece en `/guia/*`, `/casos-de-exito`, `/directorio`, `pagina-web-*` y `sitio-web-*`, y no aparece en `/admin/*`, `/agency/*`, `/dashboard/*`, `/login` ni `/registro`.
- `curl -s https://indexaia.com/llms.txt` describe administración de campañas como primer servicio.
- `npm test` pasa en verde.
