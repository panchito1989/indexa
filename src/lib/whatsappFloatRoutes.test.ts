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
