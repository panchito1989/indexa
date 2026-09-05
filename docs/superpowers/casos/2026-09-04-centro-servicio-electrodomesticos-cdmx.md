# Caso: centro de servicio de electrodomésticos y pantallas (CDMX / Edomex)

**Estado:** borrador para validación del usuario antes de publicar
**Anonimizado:** sí (consentimiento dado 2026-09-04; no se publica nombre ni customer ID)
**Fuente:** dos exportaciones nativas de Google Ads del 2026-09-04 (tarjetas de descripción
general), que juntas cubren **2026-07-23 → 2026-09-04**. Archivos en el scratchpad de la
sesión, no en el repo.
**Definición de conversión en esta cuenta:** clic al botón de WhatsApp o llamada telefónica.
La mayoría son clics a WhatsApp. **Se publica como "contactos", nunca como "clientes" ni "ventas".**
**Relación:** INDEXA trabaja con este cliente desde hace más de un año. **La cuenta de Google
Ads, en cambio, es nueva: su primer día con datos es el 23 de julio de 2026.** Google Ads no
permite comparar contra periodos anteriores porque no existen. Por eso el caso no es
"antes y después de INDEXA": es **"de cero a 97 contactos al mes, en el segundo mes"**.

---

## El arranque, semana a semana

| Semana | Fechas | Clics | Contactos | Clics → contacto | Costo por contacto ≈ |
|---|---|---|---|---|---|
| 1 | 23–29 jul | 81 | 4 | **5%** | $268 |
| 2 | 30 jul – 5 ago | 127 | **44** | **35%** | **$96** |
| 3 | 6–12 ago | 30 | 15 | 50% | $201 |
| 4 | 13–19 ago | 116 | 45 | 39% | $199 |
| 5 | 20–26 ago | 0 | 0 | — | — |
| 6 | 27 ago – 2 sep | 11 | 4 | 36% | $355 |
| 7 | 3–4 sep (2 días) | 88 | 32 | 36% | $195 |

El costo por contacto semanal es aproximado (se deriva de los días con contacto, así que
**subestima** el gasto real, nunca lo infla). Los totales exactos por rango vienen del
archivo de campañas, abajo.

**La semana 5 no tiene ni una impresión.** La cuenta estuvo apagada del 20 al 26 de agosto.
Pendiente de explicación del usuario (presupuesto, revisión de Google, pausa deliberada).
Se publique o no la causa, la tabla no se recorta: un caso que esconde la semana en cero
es justo el tipo de dato maquillado que este cluster no puede permitirse.

## Cifras (agosto 2026, 31 días, totales exactos)

| Métrica | Agosto 2026 | Primeros 9 días (23–31 jul) |
|---|---|---|
| Inversión | $15,414 MXN | $3,778 MXN |
| Contactos (WhatsApp + llamadas) | **97** | 11 |
| Costo por contacto | **$159 MXN** | $343 MXN |
| Clics | 249 | 105 |
| Clics que terminan en contacto | **39%** | 10.5% |

Por campaña (agosto):

| Campaña | Inversión | Contactos | Costo por contacto |
|---|---|---|---|
| Clientes potenciales (principal) | $14,822 | 72 | $206 (venía de $343) |
| Televisores | $592 | 25 | **$24** |
| Puebla / Cuernavaca | $0 | 0 | arrancaron en septiembre |

Septiembre, primeros 4 días: Puebla $2,922 → 11 contactos ($266); Cuernavaca $822 → 1.
El jueves 3 de septiembre, solo, trajo 32 contactos.

Lo que muestra el resto de la exportación:

- **Móvil** concentra el 86% de la inversión ($13,280 de $15,414). El cliente de un centro de servicio busca desde el teléfono, con el aparato descompuesto enfrente.
- **Cuota de impresiones: 33.75%**, apareciendo en la parte superior de la página el 79% de las veces. Los competidores identificados en la subasta (fabricantes y cadenas de servicio) quedan por debajo del 10% cada uno.
- **Mejor día:** lunes 17 de agosto, 29 contactos. Los lunes concentran el volumen (968 impresiones vs. 6 los miércoles): la gente descubre el aparato descompuesto el fin de semana y busca el lunes.
- **Audiencia:** 35 a 64 años suma el 71% de las impresiones.
- **Términos que convierten:** "técnico de refrigeradores", "lavadoras tecnico", "reparación de pantallas a domicilio", "reparacion pantallas hisense".
- **Estructura:** los grupos de anuncios por tipo de servicio (técnicos, refrigeradores, lavadoras, televisores) pasaron de 0 contactos en la primera ventana a 26 / 11 / 9 / 25 en agosto.

## Qué se puede afirmar y qué no

**Sí:**
- "Una cuenta nueva de Google Ads para un centro de servicio de electrodomésticos en CDMX/Edomex pasó de 4 contactos en su primera semana a 44 en la segunda; la tasa de clics que terminan en contacto subió de 5% a 35%."
- "En su segundo mes recibió 97 contactos por WhatsApp y llamada con $15,414 MXN: $159 por contacto."
- "Su campaña principal bajó el costo por contacto de $343 a $206; la de televisores genera contactos a $24."
- "Tiene un tercio de la cuota de impresiones de su mercado, por encima de los fabricantes."

**No:**
- Nada sobre ventas ni ingresos: un contacto no es una venta.
- Nada sobre "antes de INDEXA" ni "un año después": la cuenta tiene seis semanas.
- Nada sobre "todos nuestros clientes": es una cuenta.
- Nada que omita la semana 5 en cero.

## Pendiente para cerrar el caso

1. **¿Qué pasó del 20 al 26 de agosto?** Cero impresiones durante siete días.
2. **Confirmar la fecha de creación de la cuenta** (¿23 de julio de 2026?) y si existió una cuenta anterior del mismo cliente cuyos datos sirvan como "antes" real.
3. Confirmar el relato operativo: ¿la segmentación por tipo de servicio y la campaña de Televisores fueron cambios de agosto, o ya existían desde el arranque?
4. Repetir la misma exportación para las otras 6 cuentas administradas.

## Dónde se usa

- Guía `por-que-mi-campana-de-google-ads-no-vende`: semana 1 → semana 2 (5% → 35%) y la segmentación por servicio.
- Guía `cuanto-gastar-en-google-ads-negocio-local`: $15,414 → 97 contactos, $159 cada uno, como referencia de un negocio de servicio local.
- Guía `que-es-roas-cpl-cpc-explicado-simple`: costo por contacto real ($159, $206, $24) para explicar el CPL con cifras de verdad.
- Hub `/administracion-de-campanas`: la cuota de impresiones frente a fabricantes y el arranque desde cero.
