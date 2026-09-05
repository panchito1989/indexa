import { describe, expect, it } from "vitest";
import { WHATSAPP_NUMBER, whatsappUrl } from "./contact";

describe("WHATSAPP_NUMBER", () => {
  it("es el numero de INDEXA con lada de pais y sin simbolos", () => {
    expect(WHATSAPP_NUMBER).toBe("525610669353");
  });
});

describe("whatsappUrl", () => {
  it("arma un enlace wa.me con el mensaje codificado", () => {
    expect(whatsappUrl("Hola, ¿cuánto cuesta?")).toBe(
      "https://wa.me/525610669353?text=Hola%2C%20%C2%BFcu%C3%A1nto%20cuesta%3F"
    );
  });

  it("funciona sin mensaje", () => {
    expect(whatsappUrl("")).toBe("https://wa.me/525610669353?text=");
  });
});
