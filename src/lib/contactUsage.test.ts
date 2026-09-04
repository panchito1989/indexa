import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Números que quedaron obsoletos y no deben reaparecer.
 *
 * `5622 0428` cubre la variante formateada para humanos que vivía en
 * `public/llms.txt`, distinta de la que se usa en los enlaces `wa.me`.
 */
const FORBIDDEN = ["5622042820", "5215512345678", "5622 0428"];

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");

function filesUnder(dir: string, matches: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return filesUnder(full, matches);
    return matches(entry) ? [full] : [];
  });
}

const isSource = (name: string) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts");
/** llms.txt y llms-full.txt: lo que leen los modelos de IA. */
const isPublicText = (name: string) => name.endsWith(".txt");

function offenders(files: string[]): string[] {
  return files
    .filter((file) => {
      const content = readFileSync(file, "utf8");
      return FORBIDDEN.some((number) => content.includes(number));
    })
    .map((file) => path.relative(ROOT, file));
}

describe("uso del numero de contacto", () => {
  it("ningun archivo fuente contiene un numero de WhatsApp obsoleto", () => {
    expect(offenders(filesUnder(SRC, isSource))).toEqual([]);
  });

  it("ningun texto publico contiene un numero de WhatsApp obsoleto", () => {
    expect(offenders(filesUnder(PUBLIC, isPublicText))).toEqual([]);
  });
});
