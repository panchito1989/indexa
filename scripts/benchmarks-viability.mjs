/**
 * Reporte de viabilidad de benchmarks — NO escribe nada, sólo mide.
 *
 * Cruza: usuarios con Google Ads conectado → su sitio (categoria, ciudad)
 * → cuántas cuentas caen en cada celda.
 *
 * Uso: npx dotenv -e .env.local -- node scripts/benchmarks-viability.mjs
 *
 * Sólo lee. No modifica ni publica nada. Imprime agregados, nunca datos
 * identificables de un cliente.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/** Mínimo de cuentas por celda para poder publicar el dato (spec §8.2). */
const MIN_CUENTAS = 5;

function db() {
  if (!getApps().length) {
    // La app soporta ambos nombres (src/lib/firebaseAdmin.ts:29-32).
    const raw =
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
      throw new Error(
        "Falta FIREBASE_SERVICE_ACCOUNT (o _KEY). Corre con: npx dotenv -e .env.local -- node scripts/benchmarks-viability.mjs"
      );
    }
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getFirestore();
}

function normaliza(valor) {
  return (valor || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Busca el primer campo presente de una lista de candidatos. */
function primerCampo(doc, candidatos) {
  for (const c of candidatos) {
    const v = doc.get(c);
    if (v !== undefined && v !== null && v !== "") return { campo: c, valor: v };
  }
  return null;
}

async function main() {
  const firestore = db();

  const usuarios = await firestore.collection("usuarios").get();
  const sitios = await firestore.collection("sitios").get();

  console.log(`\nColecciones: usuarios=${usuarios.size}  sitios=${sitios.size}`);

  if (usuarios.size === 0 && sitios.size === 0) {
    console.log("\nAmbas colecciones vacías. ¿Credenciales del proyecto correcto?");
    return;
  }

  // ── Auto-diagnóstico: qué campos existen de verdad ──────────────────
  const CAMPOS_ADS = [
    "googleAdsCustomerId",
    "googleAdsLoginCustomerId",
    "googleAdsRefreshToken",
    "googleAds",
  ];
  // El campo real en `sitios` es `ownerId` (descubierto por el auto-diagnóstico
// de abajo: los otros nombres no existen en ningún documento).
const CAMPOS_UID = ["ownerId", "uid", "ownerUid", "userId", "usuarioId", "owner"];

  const presenciaAds = new Map();
  for (const u of usuarios.docs) {
    for (const c of CAMPOS_ADS) {
      if (u.get(c) !== undefined && u.get(c) !== null && u.get(c) !== "") {
        presenciaAds.set(c, (presenciaAds.get(c) || 0) + 1);
      }
    }
  }
  console.log("\nUsuarios por campo de Google Ads:");
  if (presenciaAds.size === 0) {
    console.log("  (ninguno de los campos esperados aparece en usuarios/)");
    const muestra = usuarios.docs[0];
    if (muestra) {
      console.log(`  Campos reales de un usuario: ${Object.keys(muestra.data()).join(", ")}`);
    }
  } else {
    for (const [campo, n] of presenciaAds) console.log(`  ${String(n).padStart(4)}  ${campo}`);
  }

  const presenciaUid = new Map();
  for (const s of sitios.docs) {
    for (const c of CAMPOS_UID) {
      if (s.get(c)) presenciaUid.set(c, (presenciaUid.get(c) || 0) + 1);
    }
  }
  console.log("\nSitios por campo de dueño:");
  if (presenciaUid.size === 0) {
    console.log("  (ninguno de los campos esperados aparece en sitios/)");
    const muestra = sitios.docs[0];
    if (muestra) {
      console.log(`  Campos reales de un sitio: ${Object.keys(muestra.data()).join(", ")}`);
    }
  } else {
    for (const [campo, n] of presenciaUid) console.log(`  ${String(n).padStart(4)}  ${campo}`);
  }

  const conCategoria = sitios.docs.filter((s) => s.get("categoria")).length;
  const conCiudad = sitios.docs.filter((s) => s.get("ciudad")).length;
  console.log(`\nSitios con categoria: ${conCategoria} / ${sitios.size}`);
  console.log(`Sitios con ciudad:    ${conCiudad} / ${sitios.size}`);

  // ── El cruce ────────────────────────────────────────────────────────
  const conAds = usuarios.docs.filter((u) =>
    CAMPOS_ADS.some((c) => {
      const v = u.get(c);
      return v !== undefined && v !== null && v !== "";
    })
  );

  const sitioPorUid = new Map();
  for (const s of sitios.docs) {
    const dueno = primerCampo(s, CAMPOS_UID);
    if (dueno) {
      sitioPorUid.set(String(dueno.valor), {
        categoria: s.get("categoria"),
        ciudad: s.get("ciudad"),
      });
    }
  }

  const celdas = new Map();
  let sinSitio = 0;
  let sinCategoriaOCiudad = 0;

  for (const u of conAds) {
    const sitio = sitioPorUid.get(u.id);
    if (!sitio) {
      sinSitio++;
      continue;
    }
    if (!sitio.categoria || !sitio.ciudad) {
      sinCategoriaOCiudad++;
      continue;
    }
    const clave = `${normaliza(sitio.categoria)} | ${normaliza(sitio.ciudad)}`;
    celdas.set(clave, (celdas.get(clave) || 0) + 1);
  }

  const orden = [...celdas.entries()].sort((a, b) => b[1] - a[1]);
  const viables = orden.filter(([, n]) => n >= MIN_CUENTAS);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Usuarios totales:            ${usuarios.size}`);
  console.log(`Con Google Ads conectado:    ${conAds.length}`);
  console.log(`  · sin sitio asociado:      ${sinSitio}`);
  console.log(`  · sin categoria o ciudad:  ${sinCategoriaOCiudad}`);
  console.log(`\nCeldas (categoria | ciudad): ${celdas.size}`);
  console.log(`Celdas con >= ${MIN_CUENTAS} cuentas:    ${viables.length}`);
  console.log("=".repeat(60));

  if (orden.length > 0) {
    console.log("\nDetalle (todas las celdas):");
    for (const [clave, n] of orden) {
      console.log(`  ${n >= MIN_CUENTAS ? "OK" : "  "} ${String(n).padStart(3)}  ${clave}`);
    }
  }

  // Corte alternativo: sólo industria, sin ciudad.
  const porIndustria = new Map();
  for (const [clave, n] of celdas) {
    const industria = clave.split(" | ")[0];
    porIndustria.set(industria, (porIndustria.get(industria) || 0) + n);
  }
  const industriasViables = [...porIndustria.entries()]
    .filter(([, n]) => n >= MIN_CUENTAS)
    .sort((a, b) => b[1] - a[1]);

  console.log(`\nSi agregamos SOLO por industria (sin ciudad):`);
  console.log(`Industrias con >= ${MIN_CUENTAS} cuentas: ${industriasViables.length}`);
  for (const [industria, n] of industriasViables) {
    console.log(`  OK ${String(n).padStart(3)}  ${industria}`);
  }

  // Techo teórico: ignorando el cruce con sitios, ¿cuántas cuentas hay?
  console.log(`\nTecho absoluto (cuentas conectadas, sin importar celda): ${conAds.length}`);
  if (conAds.length < MIN_CUENTAS) {
    console.log(
      `\n⚠️  Con ${conAds.length} cuenta(s) conectada(s) NINGUNA celda puede alcanzar el mínimo de ${MIN_CUENTAS}.`
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error("Falló el reporte:", err.message);
  process.exit(1);
});
