# ShieldCar — Plan de Desarrollo por Fases (MVP) y Stack Tecnológico

> Plataforma PWA para blindar compraventas P2P de autos y motos en México:
> anti-clonación, anti-suplantación de identidad y certeza legal, sin e.firma
> del SAT ni trámites complejos para el usuario.

**Estado:** documento de planeación (v1). No hay código aún; este documento
define arquitectura, fases, stack y proveedores antes de escribir la primera línea.

---

## 1. Visión del producto

Un **flujo guiado único** ("Expediente de Transacción") donde comprador y
vendedor se unen a una misma operación y la plataforma los lleva paso a paso:

```
Vendedor crea expediente → Verifica su identidad (KYC ligero)
   → Registra el vehículo (NIV/placas) → Verificación anti-clonación
Comprador se une con código/link → Verifica su identidad
   → Revisa el reporte del vehículo
Ambos → Contrato generado automáticamente → Firma con OTP por SMS
   → Constancia NOM-151 → Expediente descargable con validez probatoria
```

El expediente final (PDF + evidencias + constancia NOM-151) es el producto
que el usuario "se lleva": su seguro contra fraudes y su prueba ante un
Ministerio Público si algo sale mal.

### Los 3 pilares

| Pilar | Qué resuelve | Componentes |
|---|---|---|
| **1. Identidad (KYC ligero)** | INEs falsas, suplantación | OCR de INE, Lista Nominal (INE), CURP/RENAPO, liveness con selfie-video |
| **2. Verificación vehicular (anti-clonación)** | Autos clonados, robados, con adeudos | REPUVE, reporte de robo, adeudos/tenencias, factura SAT (UUID), fotos guiadas de seriales, NIV digital vía OBD-II |
| **3. Legal (NOM-151)** | Contratos inválidos, "vicios ocultos" legales | Contrato autogenerado con datos validados, firma electrónica simple + OTP SMS, constancia de conservación NOM-151 |

---

## 2. Stack tecnológico recomendado

Criterios: velocidad de desarrollo (equipo de 1), costo cercano a $0 en fase
MVP, escalabilidad posterior, y **cero lock-in con proveedores de terceros**
(todos detrás de interfaces intercambiables).

### Frontend

- **Next.js (App Router) + React + TypeScript + Tailwind CSS** — el equipo ya
  domina este stack (proyecto indexa). Server Components para reportes,
  Client Components para cámara/Bluetooth.
- **PWA:** `@serwist/next` (sucesor mantenido de next-pwa) para service
  worker, offline shell e instalación en home screen.
- **Cámara:** `getUserMedia` + `MediaRecorder` para captura de INE, selfie y
  fotos de seriales. La captura es 100% web, sin app nativa.
- **Bluetooth OBD-II:** **Web Bluetooth API** (Chrome/Edge Android).
  ⚠️ Limitación conocida: iOS/Safari no soporta Web Bluetooth. Estrategia:
  OBD-II es *opcional y progresivo* (badge extra de confianza), y en iOS se
  ofrece la ruta de fotos guiadas. Si el mercado lo exige, empaquetar después
  con Capacitor para iOS reutilizando el 95% del código.
- **UI:** lucide-react + framer-motion (ya conocidos). Diseño mobile-first:
  el 90%+ del uso será en teléfono, de pie junto al coche.

### Backend

- **Next.js API Routes / Server Actions en Vercel** para todo lo síncrono.
- **Trabajos asíncronos** (consultas a REPUVE/SAT que pueden tardar o
  reintentar): **Upstash QStash** (colas HTTP serverless, plan gratuito
  generoso) o Vercel Cron para lotes. Evitamos mantener workers propios.
- **Patrón de adaptadores (puertos y adaptadores):** cada proveedor externo
  (KYC, vehicular, firma) vive detrás de una interfaz propia
  (`IdentityProvider`, `VehicleDataProvider`, `SignatureProvider`). Cambiar
  de proveedor = escribir un adaptador nuevo, no reescribir el producto.

### Base de datos y almacenamiento

- **PostgreSQL gestionado (Supabase)** — preferido sobre Firestore para este
  producto porque:
  - El expediente es **relacional por naturaleza** (transacción ↔ 2 partes ↔
    vehículo ↔ N verificaciones ↔ contrato ↔ firmas ↔ evidencias).
  - Necesitamos **integridad y auditoría** con valor probatorio: constraints,
    transacciones ACID, y una tabla `audit_log` append-only con
    **encadenamiento de hashes** (cada evento incluye el hash del anterior).
  - Row Level Security para aislar expedientes entre usuarios.
- **Storage (Supabase Storage o Vercel Blob):** evidencias (fotos INE, video
  liveness, fotos de seriales, PDFs) en buckets privados, URLs firmadas de
  corta vida, **cifrado en reposo** y hash SHA-256 de cada archivo registrado
  en el expediente.
- **Datos sensibles (LFPDPPP):** los datos biométricos y de INE son datos
  personales sensibles. Política desde el día 1: minimización (guardar el
  *resultado* de la validación y hashes, no retener el video de liveness más
  del tiempo necesario), aviso de privacidad explícito, consentimiento
  expreso registrado en el audit log, y borrado programado (derechos ARCO).

### Autenticación de usuarios

- **Supabase Auth con OTP por SMS (teléfono como identidad primaria)** +
  email opcional. El teléfono verificado es además el canal de la firma OTP
  del contrato, así que la cuenta y la firma quedan ancladas al mismo número.

### Infraestructura

- **Vercel** (hosting, previews, edge) + **Supabase** (DB, auth, storage).
- **Sentry** para errores; logging estructurado de cada consulta a terceros
  (costo por consulta = hay que medirlo desde el día 1).

---

## 3. Proveedores de terceros (México)

> Los precios son estimados de mercado para arrancar la conversación
> comercial; hay que cotizar formalmente. Todos van detrás de adaptadores.

### KYC / Biometría (Pilar 1)

| Proveedor | Qué ofrece | Notas |
|---|---|---|
| **Nubarium** (recomendado MVP) | OCR INE, validación Lista Nominal INE, CURP/RENAPO, liveness pasivo, comparación facial | Mexicano, API-first, precios por consulta accesibles (~$10–25 MXN por validación completa estimado), sin mínimos enterprise |
| **MetaMap** | Flujo KYC completo embebible (SDK web) | Buen plan de arranque, flujo pre-armado = menos código propio |
| **Incode** | Suite premium (la usan bancos) | Mejor precisión, pricing enterprise — candidato para cuando haya volumen |
| **Truora / Sumsub** | Alternativas LatAm/global | Respaldo si los anteriores fallan en cobertura o precio |

**Flujo KYC ligero (sin e.firma):** foto INE frente/reverso → OCR + validación
de vigencia en Lista Nominal → CURP contra RENAPO → selfie-video con liveness
→ face match selfie vs. foto de la INE. Resultado: score + veredicto, todo
registrado en el expediente.

### Datos vehiculares (Pilar 2)

| Fuente | Vía | Notas |
|---|---|---|
| **REPUVE** (robo, registro) | Portal público (consulta directa) o agregadores tipo **APImarket.mx** / **Verificamex** | No existe API oficial pública; los agregadores cobran por consulta (~$5–20 MXN). Plan B: consulta asistida al portal público |
| **Adeudos/tenencias/multas** | APIs estatales vía agregadores (cobertura por estado: CDMX, Edomex, Jalisco, NL primero) | Cobertura estatal irregular — mostrar siempre qué se pudo verificar y qué no |
| **Factura SAT (UUID)** | Servicio público "Verifica CFDI" del SAT (UUID + RFC emisor + RFC receptor) o API de un PAC (Finkok, SW Sapien) | Valida que la factura exista y esté vigente ante el SAT — mata el fraude de facturas apócrifas |
| **Decodificación NIV/VIN** | Algoritmo propio (check digit ISO 3779) + base WMI | Detecta NIVs malformados al instante, gratis y offline |

### IA para fotos guiadas de seriales (Pilar 2)

- **MVP:** overlay visual por modelo de vehículo (dónde está el serial de
  chasis/motor) + validación de calidad de foto en el dispositivo.
- **Fase 2:** OCR del serial en la foto con un modelo de visión multimodal
  vía API (Claude / GPT-4o vision) y comparación automática contra el NIV de
  los papeles. Costo por foto: centavos de dólar.

### OBD-II (Pilar 2, diferenciador)

- Adaptadores ELM327 **BLE** genéricos (~$150–300 MXN en Mercado Libre).
- Web Bluetooth → comando OBD **Modo 09 PID 02** = VIN grabado en la ECU.
- Comparación automática: VIN de la ECU vs. VIN de la tarjeta de circulación
  /factura vs. serial fotografiado → semáforo de clonación.

### Firma electrónica + NOM-151 (Pilar 3)

La firma será **firma electrónica simple robustecida**: OTP por SMS + rastro
de auditoría (IP, dispositivo, geolocalización, KYC previo) + **constancia de
conservación NOM-151** emitida por un PSC (Prestador de Servicios de
Certificación acreditado ante la Secretaría de Economía). Eso da integridad
probatoria plena del documento sin pedirle al usuario su e.firma.

| Proveedor | Notas |
|---|---|
| **Weetrust** (candidato principal) | API de firma con OTP + NOM-151 incluida, pricing por documento accesible (~$15–40 MXN/doc estimado) |
| **Mifiel** | Excelente API, fuerte en e.firma; verificar su producto de firma simple + NOM-151 |
| **Cincel** | API-first, NOM-151 por documento, planes de arranque baratos |
| **FirmaMex (Seguridata)** | Seguridata es PSC acreditado directamente |

- **SMS OTP:** Twilio Verify (o Auronix/Calixta como alternativa local más
  barata a volumen) — se usa tanto para login como para el acto de firma.
- **Generación del contrato:** plantilla propia de contrato de compraventa
  (revisada por abogado, una sola vez) → render a PDF (react-pdf o
  Puppeteer/Chromium en serverless) con los datos ya validados inyectados +
  anexo de evidencias (resultados KYC, reporte vehicular, hashes).

---

## 4. Modelo de datos (núcleo)

```
users            (id, phone_verified, email?, created_at)
identities       (id, user_id, provider, status, curp_hash, ine_ocr_result,
                  liveness_score, face_match_score, verified_at, expires_at)
vehicles         (id, vin, plate, state, brand, model, year, vin_check_digit_ok)
transactions     (id, vehicle_id, seller_id, buyer_id, status, price,
                  created_at, closed_at)        -- el "Expediente"
verifications    (id, transaction_id, type[repuve|robo|adeudos|sat_cfdi|
                  serial_photo|obd_vin], provider, request_payload_hash,
                  result, verdict[ok|warning|fail|unavailable], created_at)
evidences        (id, transaction_id, kind, storage_path, sha256, created_at)
contracts        (id, transaction_id, template_version, pdf_sha256,
                  nom151_certificate_id, status)
signatures       (id, contract_id, user_id, otp_verified_at, ip, user_agent,
                  geo, evidence_hash)
audit_log        (id, transaction_id?, actor, event, payload_hash,
                  prev_hash, created_at)        -- append-only, hash-chain
consents         (id, user_id, type[privacy|biometric|contract], version,
                  granted_at, revoked_at?)
```

Estados del expediente (máquina de estados explícita):

```
draft → seller_verified → vehicle_registered → vehicle_verified
      → buyer_joined → buyer_verified → contract_generated
      → signing → signed → certified (NOM-151) → closed
      (+ ramas: flagged / cancelled / expired)
```

---

## 5. Plan de desarrollo por fases

### Fase 0 — Fundaciones (1–2 semanas)

- Repo nuevo, Next.js + TS + Tailwind + Serwist (PWA instalable), CI básico.
- Supabase: esquema inicial, RLS, auth por SMS OTP.
- Design system mínimo mobile-first (flujo tipo wizard, semáforos
  verde/amarillo/rojo como lenguaje visual central del producto).
- Aviso de privacidad + consentimientos (bloqueante legal: datos biométricos).
- Esqueleto del patrón de adaptadores + `audit_log` con hash-chain.

### Fase 1 — Verificación vehicular "Reporte ShieldCar" (3–4 semanas) ⭐ EMPEZAR AQUÍ

**Producto vendible por sí solo:** el usuario mete NIV/placas y recibe un
reporte anti-clonación. Es el módulo con valor inmediato, sin dependencia de
contratos con proveedores de KYC/firma, y funciona como gancho de adquisición
(freemium: 1 reporte básico gratis, reporte completo de pago).

- Captura de NIV (con OCR opcional de la tarjeta de circulación) + placas.
- Validación check-digit del VIN + decodificación WMI (marca/año/planta).
- Consulta REPUVE + reporte de robo + adeudos (empezar con CDMX/Edomex).
- Validación de factura ante el SAT por UUID.
- Reporte visual con semáforos + qué se verificó y qué no + PDF descargable.
- Cola asíncrona (QStash) con reintentos para las consultas externas.

**Criterio de salida:** un desconocido puede pagar, consultar un auto real y
recibir un reporte útil en < 2 minutos.

### Fase 2 — Identidad KYC ligero (3–4 semanas)

- Integración Nubarium (o MetaMap): OCR INE → Lista Nominal → CURP/RENAPO.
- Liveness por selfie-video + face match contra la INE.
- Pantallas de captura con guías visuales (marco para INE, instrucciones de
  video) y manejo de reintentos/fallos de cámara.
- Política de retención/minimización de biométricos implementada de verdad
  (no "después lo borramos").

**Criterio de salida:** una INE falsa o una selfie que no corresponde
bloquean el flujo; una identidad legítima pasa en < 3 minutos.

### Fase 3 — Expediente P2P + Contrato + NOM-151 (4–5 semanas)

- Flujo de dos partes: vendedor crea expediente, comparte link/código,
  comprador se une; máquina de estados completa.
- Generación del contrato PDF con plantilla legal + datos validados.
- Integración con PSC (Weetrust/Cincel): firma OTP de ambas partes +
  constancia NOM-151 + expediente final descargable.
- Pagos (Stripe, ya conocido): cobro por expediente completo.

**Criterio de salida = MVP completo:** dos personas reales cierran una
compraventa con expediente certificado NOM-151, de punta a punta, solo con
sus teléfonos.

### Fase 4 — Anti-clonación avanzada (post-MVP, 3–4 semanas)

- Guía visual interactiva por marca/modelo para fotos de seriales de
  chasis/motor + OCR con visión por IA + comparación automática vs. papeles.
- **OBD-II vía Web Bluetooth** (Android): lectura del VIN de la ECU y
  semáforo de coincidencia. Badge "Verificado a nivel computadora".

### Fase 5 — Crecimiento (backlog)

- Escrow / pago protegido entre las partes (aliado regulado — no ser
  nosotros la entidad financiera).
- Cobertura de adeudos en más estados; historial de siniestros (aseguradoras).
- Wrapper Capacitor para OBD-II en iOS si la demanda lo justifica.
- API B2B (lotes de seminuevos, financieras).

---

## 6. Riesgos principales y mitigación

| Riesgo | Mitigación |
|---|---|
| Sin API oficial de REPUVE; agregadores pueden fallar o encarecer | Adaptadores intercambiables + degradación honesta ("no pudimos verificar X, hazlo aquí manualmente") + cachear resultados |
| Valor probatorio de la firma simple cuestionado | La fortaleza no es el OTP aislado sino la **cadena completa**: KYC + evidencias + hash-chain + NOM-151. Validar la plantilla y el flujo con un abogado litigante ANTES de la Fase 3 |
| Datos biométricos = riesgo regulatorio (LFPDPPP) y reputacional | Minimización, cifrado, retención corta, consentimiento expreso versionado, DPA firmado con cada proveedor |
| Cobertura estatal irregular de adeudos | Transparencia radical en el reporte: checklist de qué SÍ y qué NO se verificó |
| Costo variable por consulta puede comerse el margen | Registrar costo por verificación en `verifications` desde el día 1; pricing del reporte ≥ 3× costo de datos |

---

## 7. Decisión: ¿por dónde empezamos a programar?

**Fase 1: el Reporte Vehicular (anti-clonación por NIV/placas).**

Razones:
1. **Valor inmediato y monetizable solo**: nadie paga por "hacer KYC", pero sí
   por saber si el auto que va a comprar es robado o clonado.
2. **Cero dependencia de contratos comerciales lentos** (KYC y PSC requieren
   alta comercial; REPUVE/SAT tienen rutas públicas para arrancar).
3. **Valida el mercado barato**: si la gente no paga por el reporte, hay que
   repensar antes de invertir en firma y KYC.
4. **Construye el esqueleto real** (expediente, verificaciones, evidencias,
   audit log) sobre el que se montan las Fases 2 y 3 sin retrabajo.

El primer sprint de código sería: Fase 0 (fundaciones) + captura de NIV con
validación de check-digit + primera consulta REPUVE de punta a punta.
