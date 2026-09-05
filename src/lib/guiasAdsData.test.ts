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
