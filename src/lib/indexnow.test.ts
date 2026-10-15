import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INDEXNOW_KEY,
  claveValida,
  enviarIndexNow,
  payloadIndexNow,
  soloDelHost,
  urlsDeSitemap,
} from "./indexnow";

const ROOT = path.resolve(__dirname, "..", "..");

describe("clave IndexNow", () => {
  it("tiene el formato que el protocolo acepta", () => {
    expect(claveValida(INDEXNOW_KEY)).toBe(true);
    expect(claveValida("corta")).toBe(false);
    expect(claveValida(INDEXNOW_KEY.toUpperCase())).toBe(false);
  });

  it("se sirve en public/<clave>.txt con la clave como contenido", () => {
    const archivo = path.join(ROOT, "public", `${INDEXNOW_KEY}.txt`);
    expect(existsSync(archivo)).toBe(true);
    expect(readFileSync(archivo, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
});

describe("urlsDeSitemap", () => {
  it("extrae las URLs y decodifica &amp;", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://indexaia.com/</loc></url>
      <url><loc> https://indexaia.com/guia/x?a=1&amp;b=2 </loc></url>
    </urlset>`;
    expect(urlsDeSitemap(xml)).toEqual([
      "https://indexaia.com/",
      "https://indexaia.com/guia/x?a=1&b=2",
    ]);
  });

  it("devuelve vacio si no hay loc", () => {
    expect(urlsDeSitemap("<urlset></urlset>")).toEqual([]);
  });
});

describe("soloDelHost", () => {
  it("descarta URLs ajenas, malformadas y repetidas", () => {
    const urls = [
      "https://indexaia.com/a",
      "https://otro.com/b",
      "no-es-url",
      "https://indexaia.com/a",
      "https://www.indexaia.com/c",
    ];
    expect(soloDelHost(urls, "indexaia.com")).toEqual(["https://indexaia.com/a"]);
  });
});

describe("payloadIndexNow", () => {
  it("apunta keyLocation al archivo publico del host", () => {
    const p = payloadIndexNow("indexaia.com", INDEXNOW_KEY, ["https://indexaia.com/"]);
    expect(p.keyLocation).toBe(`https://indexaia.com/${INDEXNOW_KEY}.txt`);
    expect(p.host).toBe("indexaia.com");
    expect(p.urlList).toEqual(["https://indexaia.com/"]);
  });
});

describe("enviarIndexNow", () => {
  it("hace POST JSON al endpoint y reporta 202 como aceptado", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response("", { status: 202 });
    }) as unknown as typeof fetch;

    const r = await enviarIndexNow(
      "indexaia.com",
      ["https://indexaia.com/", "https://otro.com/x"],
      INDEXNOW_KEY,
      fetchFalso
    );

    expect(r).toEqual({ enviadas: 1, status: 202, aceptado: true });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://api.indexnow.org/indexnow");
    expect(llamadas[0].init.method).toBe("POST");
    const body = JSON.parse(String(llamadas[0].init.body));
    expect(body.urlList).toEqual(["https://indexaia.com/"]);
    expect(body.key).toBe(INDEXNOW_KEY);
  });

  it("no llama a la red si no hay URLs del host", async () => {
    let llamadas = 0;
    const fetchFalso = (async () => {
      llamadas++;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await enviarIndexNow("indexaia.com", ["https://otro.com/"], INDEXNOW_KEY, fetchFalso);
    expect(r.enviadas).toBe(0);
    expect(llamadas).toBe(0);
  });

  it("rechaza una clave invalida antes de tocar la red", async () => {
    await expect(enviarIndexNow("indexaia.com", ["https://indexaia.com/"], "mala")).rejects.toThrow(/INDEXNOW_KEY/);
  });
});
