# Captura de categoría y ciudad en el alta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todo sitio nuevo nazca con `categoria` y `ciudad`, y que los 27 sitios existentes que los tienen vacíos lo vean como un pendiente visible, no como un campo enterrado.

**Architecture:** Los dos flujos con formulario (admin y agencia) piden ambos campos como obligatorios y los escriben al crear. El flujo self-serve (checkout) no puede pedirlos sin meter fricción en el pago, así que ahí el sitio nace vacío y el editor muestra un aviso prominente hasta que se llenan. La regla "¿le falta SEO local a este sitio?" vive en un helper puro y testeado, para que el aviso del cliente y cualquier reporte del admin usen exactamente el mismo criterio.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Firestore (cliente y Admin), vitest 3.

**Por qué importa ahora:** `buildLocalBusinessJsonLd` en `src/app/sitio/[slug]/page.tsx:145` usa `ciudad` para `addressLocality` y `areaServed`. Con el campo vacío, **27 de 28 sitios de clientes publican un LocalBusiness sin ciudad**, y el bloque "negocios en tu ciudad" nunca se dispara. Es SEO local que clientes que ya pagan están perdiendo hoy.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/sitioSeoLocal.ts` (nuevo) | `faltaSeoLocal(sitio)`: la única definición de "le faltan categoría o ciudad". |
| `src/lib/sitioSeoLocal.test.ts` (nuevo) | Contrato del helper, incluidos espacios en blanco. |
| `src/app/api/agency/create-client/route.ts` (modificar) | Exige y guarda `categoria` y `ciudad`. |
| `src/app/agency/dashboard/page.tsx` (modificar) | Formulario de alta de cliente: dos inputs obligatorios. |
| `src/app/admin/clientes/page.tsx` (modificar) | Modal de alta: dos inputs obligatorios, incluidos en el `setDoc`. |
| `src/app/dashboard/page.tsx` (modificar) | Aviso en el editor cuando `faltaSeoLocal` es verdadero. |

---

## Task 1: Helper `faltaSeoLocal`

**Files:**
- Create: `src/lib/sitioSeoLocal.ts`
- Test: `src/lib/sitioSeoLocal.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sitioSeoLocal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { faltaSeoLocal } from "./sitioSeoLocal";

describe("faltaSeoLocal", () => {
  it("es falso cuando ambos campos vienen llenos", () => {
    expect(faltaSeoLocal({ categoria: "Taller mecánico", ciudad: "Monterrey" })).toBe(false);
  });

  it("es verdadero si falta la categoria", () => {
    expect(faltaSeoLocal({ categoria: "", ciudad: "Monterrey" })).toBe(true);
  });

  it("es verdadero si falta la ciudad", () => {
    expect(faltaSeoLocal({ categoria: "Taller mecánico", ciudad: "" })).toBe(true);
  });

  it("trata los espacios en blanco como vacio", () => {
    expect(faltaSeoLocal({ categoria: "   ", ciudad: "Monterrey" })).toBe(true);
  });

  it("tolera campos ausentes en documentos viejos", () => {
    expect(faltaSeoLocal({})).toBe(true);
    expect(faltaSeoLocal({ categoria: undefined, ciudad: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/sitioSeoLocal.test.ts`
Expected: FAIL — no existe `./sitioSeoLocal`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/sitioSeoLocal.ts`:

```ts
/**
 * ¿Le faltan a este sitio los datos de SEO local?
 *
 * `categoria` y `ciudad` alimentan el LocalBusiness JSON-LD del sitio
 * (`addressLocality`, `areaServed`) y el bloque "negocios en tu ciudad".
 * Sin ellos, el sitio existe pero no compite en búsquedas locales.
 *
 * Única definición del criterio: el aviso del cliente y cualquier reporte
 * del admin deben usar esta función, no repetir la comprobación.
 */
export interface SeoLocalCampos {
  categoria?: string | null;
  ciudad?: string | null;
}

export function faltaSeoLocal(sitio: SeoLocalCampos): boolean {
  const categoria = (sitio.categoria ?? "").trim();
  const ciudad = (sitio.ciudad ?? "").trim();
  return categoria.length === 0 || ciudad.length === 0;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/sitioSeoLocal.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/sitioSeoLocal.ts src/lib/sitioSeoLocal.test.ts
git commit -m "feat: criterio unico de SEO local faltante en un sitio"
```

---

## Task 2: Alta de agencia exige categoría y ciudad

**Files:**
- Modify: `src/app/api/agency/create-client/route.ts` (interfaz `CreateClientBody` ~línea 12, validación ~línea 39, `addDocument` ~línea 97)
- Modify: `src/app/agency/dashboard/page.tsx` (formulario que llama a `/api/agency/create-client`, ~línea 217)

- [ ] **Step 1: Ampliar el contrato de la ruta**

En `CreateClientBody`, agregar:

```ts
  categoria: string;
  ciudad: string;
```

En la destructuración del body, agregar `categoria, ciudad`. En la validación existente (`if (!businessName || !clientEmail || !clientPassword)`), extenderla a:

```ts
    if (!businessName || !clientEmail || !clientPassword || !categoria?.trim() || !ciudad?.trim()) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: nombre, email, contraseña, categoría y ciudad." },
        { status: 400 }
      );
    }
```

(Conservar el formato de respuesta de error que ya usa la ruta; si difiere del ejemplo, seguir el existente.)

En el `addDocument("sitios", {...})`, agregar junto a `nombre`:

```ts
      categoria: categoria.trim(),
      ciudad: ciudad.trim(),
```

- [ ] **Step 2: Formulario de la agencia**

En `src/app/agency/dashboard/page.tsx`, localizar los estados del formulario de alta (`newName`, `newEmail`, `newPassword`) y agregar:

```tsx
  const [newCategoria, setNewCategoria] = useState("");
  const [newCiudad, setNewCiudad] = useState("");
```

Agregar dos inputs junto al de nombre, siguiendo el mismo estilo de los inputs vecinos, ambos con `required`:

```tsx
<input
  type="text"
  required
  value={newCategoria}
  onChange={(e) => setNewCategoria(e.target.value)}
  placeholder="Categoría (ej. Taller mecánico, Dentista)"
/>
<input
  type="text"
  required
  value={newCiudad}
  onChange={(e) => setNewCiudad(e.target.value)}
  placeholder="Ciudad (ej. Monterrey)"
/>
```

En el `fetch("/api/agency/create-client", ...)`, agregar al body `categoria: newCategoria.trim(), ciudad: newCiudad.trim()`. Al limpiar el formulario tras el alta, vaciar también los dos estados nuevos.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agency/create-client/route.ts src/app/agency/dashboard/page.tsx
git commit -m "feat: el alta de cliente por agencia exige categoria y ciudad"
```

---

## Task 3: Alta desde el admin exige categoría y ciudad

**Files:**
- Modify: `src/app/admin/clientes/page.tsx` (estados ~línea 67-70, guard ~línea 185, `setDoc` ~línea 195, JSX del modal)

- [ ] **Step 1: Estados y guard**

Junto a `sitioNombre`, `sitioSlug`, `sitioWhatsapp`, `sitioEmail`, agregar:

```tsx
  const [sitioCategoria, setSitioCategoria] = useState("");
  const [sitioCiudad, setSitioCiudad] = useState("");
```

Extender el guard `if (!db || !modalClient || !sitioNombre.trim()) return;` a:

```tsx
    if (!db || !modalClient || !sitioNombre.trim() || !sitioCategoria.trim() || !sitioCiudad.trim()) return;
```

- [ ] **Step 2: Escribirlos en el documento**

En el `setDoc(sitioRef, {...})`, agregar junto a `nombre`:

```tsx
        categoria: sitioCategoria.trim(),
        ciudad: sitioCiudad.trim(),
```

- [ ] **Step 3: Inputs en el modal**

Agregar dos inputs junto al de nombre del sitio, con el mismo estilo de los vecinos y `required`, con placeholders `"Categoría del negocio"` y `"Ciudad"`. Al cerrar o resetear el modal, vaciar los dos estados nuevos donde se vacían los demás.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/clientes/page.tsx
git commit -m "feat: el alta desde el admin exige categoria y ciudad"
```

---

## Task 4: Aviso en el editor del cliente

**Files:**
- Modify: `src/app/dashboard/page.tsx`

El flujo self-serve crea el sitio automáticamente al hacer checkout (`handleNewSitioCheckout`, ~línea 426), sin formulario. **No se le agregan campos**: meter fricción antes del pago cuesta más de lo que vale. En cambio, el editor avisa hasta que se llenen.

- [ ] **Step 1: Importar el helper**

```tsx
import { faltaSeoLocal } from "@/lib/sitioSeoLocal";
```

- [ ] **Step 2: Aviso prominente**

Localizar el bloque `{/* SEO Local fields */}` (~línea 1070). Inmediatamente **antes** de ese bloque, dentro del mismo contenedor, agregar:

```tsx
                {faltaSeoLocal(sitio) && (
                  <div
                    role="status"
                    className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
                  >
                    <p className="font-semibold">Tu sitio aún no aparece en búsquedas de tu ciudad</p>
                    <p className="mt-1">
                      Falta llenar la categoría del negocio y la ciudad. Sin esos dos datos,
                      Google no sabe dónde mostrarte. Se llenan aquí abajo y toma un minuto.
                    </p>
                  </div>
                )}
```

`sitio` es el estado del editor (`SitioData`), que ya incluye `categoria` y `ciudad`.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: exitoso.

- [ ] **Step 4: Verificar en el navegador**

Levantar el preview, entrar al dashboard de un cliente con `ciudad` vacía y confirmar que el aviso aparece sobre la sección "SEO Local", y que desaparece al llenar ambos campos y guardar.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: aviso en el editor cuando faltan categoria o ciudad"
```

---

## Criterios de aceptación

- Un cliente creado por agencia o por admin **no puede** nacer sin categoría ni ciudad.
- Un cliente self-serve nace vacío pero ve el aviso hasta llenarlos.
- `faltaSeoLocal` es la única definición del criterio; ningún archivo repite la comprobación de vacío.
- `npm test`, `npx tsc --noEmit` y `npm run build` en verde.

## Fuera de alcance (a propósito)

- **Backfill de los 27 sitios existentes.** El dato correcto lo tienen el dueño o el admin, no el código. El aviso del editor es lo que empuja al dueño a llenarlo; una herramienta de admin para hacerlo en lote es una tarea aparte si se quiere acelerar.
