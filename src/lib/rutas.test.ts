import { describe, expect, it } from "vitest";
import { bajoPrefijo } from "./rutas";

describe("bajoPrefijo", () => {
  it("cubre el prefijo exacto y sus subrutas", () => {
    expect(bajoPrefijo("/admin", "/admin")).toBe(true);
    expect(bajoPrefijo("/admin/login", "/admin")).toBe(true);
    expect(bajoPrefijo("/admin/campanas/google-ads", "/admin")).toBe(true);
  });

  it("NO confunde un prefijo con una ruta que solo empieza igual", () => {
    expect(bajoPrefijo("/administracion-de-campanas", "/admin")).toBe(false);
    expect(bajoPrefijo("/administracion-de-campanas-usa", "/admin")).toBe(false);
    expect(bajoPrefijo("/agencyx", "/agency")).toBe(false);
    expect(bajoPrefijo("/agencia-de-seo", "/agency")).toBe(false);
  });

  it("tolera la barra final en el prefijo", () => {
    expect(bajoPrefijo("/api/contact", "/api/")).toBe(true);
    expect(bajoPrefijo("/api", "/api/")).toBe(true);
    expect(bajoPrefijo("/apis", "/api/")).toBe(false);
  });

  it("el prefijo raiz cubre todo", () => {
    expect(bajoPrefijo("/", "/")).toBe(true);
    expect(bajoPrefijo("/guia/x", "/")).toBe(true);
  });
});
