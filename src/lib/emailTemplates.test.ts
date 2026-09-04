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
