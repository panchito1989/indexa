import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CIUDADES_FUSIONADAS,
  DESTINO_PAGINAS_WEB,
  REDIRECCIONES_LEGACY,
} from "./redireccionesLegacy";
import { servicios } from "./serviciosData";

const APP_DIR = path.resolve(__dirname, "../app");

/** `/ruta` → true si existe `src/app/ruta/page.tsx`. */
function existePagina(ruta: string): boolean {
  const rel = ruta === "/" ? "page.tsx" : path.join(ruta.slice(1), "page.tsx");
  return existsSync(path.join(APP_DIR, rel));
}

/** Los destinos bajo /servicios/ son dinámicos: se validan contra el registro. */
function destinoVivo(destino: string): boolean {
  const servicio = /^\/servicios\/([^/]+)$/.exec(destino);
  if (servicio) return servicios.some((s) => s.slug === servicio[1]);
  return existePagina(destino);
}

const fuentes = REDIRECCIONES_LEGACY.map((x) => x.source);
const destinos = REDIRECCIONES_LEGACY.map((x) => x.destination);

describe("redirecciones legacy", () => {
  it("todas son permanentes (301)", () => {
    for (const x of REDIRECCIONES_LEGACY) expect(x.permanent).toBe(true);
  });

  it("no hay orígenes repetidos", () => {
    expect(new Set(fuentes).size).toBe(fuentes.length);
  });

  it("ningún origen apunta a sí mismo ni a otro origen (sin cadenas de redirección)", () => {
    for (const x of REDIRECCIONES_LEGACY) {
      expect(x.destination).not.toBe(x.source);
      expect(fuentes).not.toContain(x.destination);
    }
  });

  it("cada destino es una ruta interna y una página viva", () => {
    for (const destino of destinos) {
      expect(destino.startsWith("/")).toBe(true);
      expect(destino.includes(":")).toBe(false);
      expect(destinoVivo(destino), `destino muerto: ${destino}`).toBe(true);
    }
  });

  it("ningún origen estático sigue existiendo como página (la redirección la taparía)", () => {
    for (const fuente of fuentes) {
      if (fuente.includes(":")) continue;
      expect(existePagina(fuente), `${fuente} existe y está redirigida a la vez`).toBe(false);
    }
  });

  it("el enlace roto /demo lleva a la demo real", () => {
    expect(REDIRECCIONES_LEGACY.find((x) => x.source === "/demo")?.destination).toBe("/probar");
  });

  it("las landings de ciudad fusionadas van a la página de sitios web; CDMX sigue viva", () => {
    for (const ciudad of CIUDADES_FUSIONADAS) {
      const x = REDIRECCIONES_LEGACY.find((y) => y.source === `/pagina-web-${ciudad}`);
      expect(x?.destination, ciudad).toBe(DESTINO_PAGINAS_WEB);
    }
    expect(fuentes).not.toContain("/pagina-web-cdmx");
    expect(existePagina("/pagina-web-cdmx")).toBe(true);
  });
});
