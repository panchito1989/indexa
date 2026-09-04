import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_MXN, planOfferMx } from "./pricing";

const ROOT = path.resolve(__dirname, "..", "..");

/** Precios de los tres planes retirados en jun-2026. */
const RETIRED_PRICES = ["$299", "$599", "$1,299", "$1299"];

/**
 * Nombres de los planes retirados. Se buscan con la palabra "plan" delante
 * para no chocar con el uso legítimo de "profesional" como adjetivo
 * ("sitio web profesional"), que aparece por todo el copy.
 */
const RETIRED_TIERS = [
  // Prosa: "en el plan Profesional puedes..."
  "plan Starter",
  "plan Profesional",
  "plan Enterprise",
  "En Starter",
  // Datos: `plan: "Profesional"` en el registro de casos de éxito. La primera
  // versión de esta guarda sólo cubría la prosa y por eso dejó pasar tres
  // insignias "Plan Profesional" visibles en /casos-de-exito.
  'plan: "Starter"',
  'plan: "Profesional"',
  'plan: "Enterprise"',
];

describe("precio del plan", () => {
  it("es el plan unico de 699 MXN", () => {
    expect(PLAN_MXN.price).toBe("699");
    expect(PLAN_MXN.currency).toBe("MXN");
  });

  it("expone un Offer simple, no un rango de tres planes", () => {
    expect(planOfferMx["@type"]).toBe("Offer");
    expect(planOfferMx.price).toBe("699");
    expect(JSON.stringify(planOfferMx)).not.toContain("299");
  });

  it("la pagina de precios muestra el mismo numero", () => {
    const pricing = readFileSync(path.join(ROOT, "src/components/Pricing.tsx"), "utf8");
    expect(pricing).toContain(PLAN_MXN.price);
  });

  it("ningun texto publico anuncia los planes retirados", () => {
    const offenders = ["public/llms.txt", "public/llms-full.txt"].filter((rel) => {
      const content = readFileSync(path.join(ROOT, rel), "utf8");
      return RETIRED_PRICES.some((price) => content.includes(price));
    });

    expect(offenders).toEqual([]);
  });

  it("no se ofertan funciones detras de un plan que ya no existe", () => {
    // Con plan único, decir "en el plan Profesional puedes..." es falso en la
    // dirección más costosa: sugiere que hay que subir de plan para algo que
    // ya viene incluido.
    const surfaces = [
      "public/llms.txt",
      "public/llms-full.txt",
      "src/components/FAQ.tsx",
      "src/app/casos-de-exito/page.tsx",
    ];

    const offenders = surfaces.flatMap((rel) => {
      const content = readFileSync(path.join(ROOT, rel), "utf8");
      return RETIRED_TIERS.filter((tier) => content.includes(tier)).map(
        (tier) => `${rel}: ${tier}`
      );
    });

    expect(offenders).toEqual([]);
  });
});
