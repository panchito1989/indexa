import { describe, expect, it } from "vitest";
import { mesLegible } from "./fechas";

describe("mesLegible", () => {
  it("convierte YYYY-MM en mes y año en español", () => {
    expect(mesLegible("2026-09")).toBe("septiembre de 2026");
    expect(mesLegible("2026-01")).toBe("enero de 2026");
  });

  it("no toca lo que no tenga ese formato", () => {
    expect(mesLegible("septiembre 2026")).toBe("septiembre 2026");
  });
});
