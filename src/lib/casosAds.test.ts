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
