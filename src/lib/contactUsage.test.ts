import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Números que quedaron obsoletos y no deben reaparecer en el código. */
const FORBIDDEN = ["5622042820", "5215512345678"];

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || entry.endsWith(".test.ts")) return [];
    return [full];
  });
}

describe("uso del numero de contacto", () => {
  it("ningun archivo fuente contiene un numero de WhatsApp obsoleto", () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const content = readFileSync(file, "utf8");
      return FORBIDDEN.some((number) => content.includes(number));
    });

    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
