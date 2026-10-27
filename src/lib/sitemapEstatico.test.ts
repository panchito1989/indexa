import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REDIRECCIONES_LEGACY } from "./redireccionesLegacy";
import { PAGINAS_ESTATICAS } from "./sitemapEstatico";

const APP_DIR = path.resolve(__dirname, "../app");

function existePagina(ruta: string): boolean {
  const rel = ruta === "/" ? "page.tsx" : path.join(ruta.slice(1), "page.tsx");
  return existsSync(path.join(APP_DIR, rel));
}

const rutas = PAGINAS_ESTATICAS.map((x) => x.path);

describe("sitemap estático", () => {
  it("cada ruta tiene su page.tsx (el sitemap nunca lista un 404)", () => {
    for (const ruta of rutas) {
      expect(existePagina(ruta), `sin página: ${ruta}`).toBe(true);
    }
  });

  it("ninguna ruta está redirigida (el sitemap nunca lista un 301)", () => {
    const redirigidas = new Set(REDIRECCIONES_LEGACY.map((x) => x.source));
    for (const ruta of rutas) {
      expect(redirigidas.has(ruta), `redirigida: ${ruta}`).toBe(false);
    }
  });

  it("no hay rutas repetidas ni rutas de autenticación", () => {
    expect(new Set(rutas).size).toBe(rutas.length);
    expect(rutas).not.toContain("/login");
  });

  it("prioridades válidas y lastModified real (YYYY-MM-DD, nunca futuro)", () => {
    const hoy = new Date().toISOString().slice(0, 10);
    for (const x of PAGINAS_ESTATICAS) {
      expect(x.priority).toBeGreaterThan(0);
      expect(x.priority).toBeLessThanOrEqual(1);
      if (x.lastModified !== undefined) {
        expect(x.lastModified, x.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(x.lastModified <= hoy, `${x.path} con fecha futura`).toBe(true);
      }
    }
  });

  it("la home y los hubs de administración de campañas están incluidos", () => {
    expect(rutas).toContain("/");
    expect(rutas).toContain("/administracion-de-campanas");
    expect(rutas).toContain("/administracion-de-campanas-usa");
  });
});
