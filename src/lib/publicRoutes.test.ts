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
