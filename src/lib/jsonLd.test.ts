import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "./jsonLd";

describe("jsonLdHtml", () => {
  const peligroso = {
    "@type": "FAQPage",
    texto: 'Cierra el script </script><img src=x onerror=alert(1)> & sigue',
  };

  it("no deja ningun < > ni & en la salida", () => {
    const html = jsonLdHtml(peligroso);
    expect(html).not.toMatch(/[<>&]/);
    expect(html).not.toContain("</script>");
  });

  it("el escape es sin perdida: al parsearlo vuelve el mismo objeto", () => {
    expect(JSON.parse(jsonLdHtml(peligroso))).toEqual(peligroso);
  });

  it("un objeto inocuo queda igual que JSON.stringify", () => {
    const obj = { "@context": "https://schema.org", nombre: "INDEXA", n: 97 };
    expect(jsonLdHtml(obj)).toBe(JSON.stringify(obj));
  });
});
