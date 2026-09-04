import { describe, expect, it } from "vitest";
import { faltaSeoLocal } from "./sitioSeoLocal";

describe("faltaSeoLocal", () => {
  it("es falso cuando ambos campos vienen llenos", () => {
    expect(faltaSeoLocal({ categoria: "Taller mecánico", ciudad: "Monterrey" })).toBe(false);
  });

  it("es verdadero si falta la categoria", () => {
    expect(faltaSeoLocal({ categoria: "", ciudad: "Monterrey" })).toBe(true);
  });

  it("es verdadero si falta la ciudad", () => {
    expect(faltaSeoLocal({ categoria: "Taller mecánico", ciudad: "" })).toBe(true);
  });

  it("trata los espacios en blanco como vacio", () => {
    expect(faltaSeoLocal({ categoria: "   ", ciudad: "Monterrey" })).toBe(true);
  });

  it("tolera campos ausentes en documentos viejos", () => {
    expect(faltaSeoLocal({})).toBe(true);
    expect(faltaSeoLocal({ categoria: undefined, ciudad: null })).toBe(true);
  });
});
