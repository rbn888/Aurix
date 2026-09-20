# Comparador de rentabilidad · cobertura REAL del proveedor

SPEC SUPREME CLOSURE §6 + FX histórico. Este documento existe porque el founder
pidió **verificar con una sonda focal que el proveedor devuelve las parejas
necesarias, y documentar los identificadores usados, ANTES de implementar**.
Todo lo de abajo está medido contra el endpoint desplegado
(`/api/prices/history-yahoo` y `/api/prices/history` en Vercel), no deducido.

Fecha de la sonda: **2026-09-20**.

## Identificadores usados

| Comparador | Identificador | Proveedor | Tipo de rentabilidad |
|---|---|---|---|
| S&P 500 | `^GSPC` | Yahoo (proxy Vercel) | price return |
| Nasdaq 100 | `^NDX` | Yahoo (proxy Vercel) | price return |
| Bitcoin | `BTC-USD` | Yahoo (proxy Vercel) | price return |
| Oro | `GC=F` | Yahoo (proxy Vercel) | price return |
| FX EUR | `EURUSD=X` | Yahoo (proxy Vercel) | — (cotiza **USD por EUR**) |

**Nasdaq 100 es `^NDX`.** El registro de Market sólo tenía `^IXIC`, que es el
**Composite** — unos 3.000 valores frente a 100— y cuya rentabilidad no es la
misma. Se verificó que `^NDX` responde en los cinco rangos antes de ofrecerlo.

**Los cuatro son PRICE RETURN** y se declara en pantalla. Yahoo sirve el NIVEL
del índice, que no incorpora dividendos; el oro y el bitcoin no tienen dividendo
que incorporar. No se mezcla con total return porque no hay ningún total return
en el catálogo, y no se inventa uno que el proveedor no da.

**Bitcoin va por Yahoo y no por CoinGecko**, aunque CoinGecko ya esté integrado:
con la clave Demo del proyecto, `days=max` responde `upstream_401` de forma
determinista y el resto de rangos entra en `rate_limit` con facilidad (medido).
`BTC-USD` en Yahoo cubre los cinco rangos con una sola granularidad y sin clave.

## Cobertura medida, por rango

Número de puntos devueltos:

| rango | `^GSPC` | `^NDX` | `GC=F` | `BTC-USD` | `EURUSD=X` |
|---|---|---|---|---|---|
| 24h | 79 (5m) | 79 (5m) | **0** | 128 | 270 |
| 7d | 131 (15m) | 131 (15m) | 345 | — | 474 |
| 30d | 22 (1d) | 22 (1d) | 21 | — | 25 |
| 1y | 251 (1d) | 251 (1d) | 250 | — | 261 |
| all | 169 (1wk) | 165 (1wk) | 268 | 145 | 275 |

### Huecos declarados, y qué hace el producto

1. **Oro en 24h: cero puntos.** No es un error del proveedor: el futuro no tiene
   serie de 5 minutos utilizable en esa ventana. El comparador responde
   **«Datos insuficientes»** y conserva la serie propia. Fail-closed.
2. **Índices en 24h fuera de sesión.** `^GSPC`/`^NDX` sólo tienen datos de la
   última sesión bursátil. Si la ventana de 24 h de la cartera no solapa con una
   sesión, no hay buckets comunes y se responde **«Datos insuficientes»**. Es
   correcto: no hay nada que comparar, y rellenarlo exigiría interpolar.
3. **`all` con granularidad semanal.** El benchmark en `all` viene en velas de
   una semana, así que el bucket común es semanal y la comparación tiene tantos
   puntos como semanas compartidas. Con la historia corta de hoy eso son pocos
   puntos, y la card lo declara con «Comparación disponible desde [fecha]».

## Divisas base soportadas

Aurix admite **exactamente dos**: `USD` y `EUR` (`baseCurrency`, y los únicos
dos botones de preferencia). Por tanto el adaptador histórico necesita **una
sola pareja**, `EURUSD=X`, y está verificada en los cinco rangos.

- Con base **USD** no hay conversión: el benchmark ya cotiza en USD.
- Con base **EUR** cada punto del benchmark se divide por el cierre de
  `EURUSD=X` **del mismo bucket** (el par cotiza USD por EUR).
- **El tipo de cambio ACTUAL no se usa jamás** para convertir historia. `toBase()`
  convierte al tipo de hoy y aplicarlo a una serie de hace un año publicaría una
  rentabilidad que nunca ocurrió.
- Un bucket **sin FX se descarta**, nunca se interpola. Si tras el descarte
  quedan menos de dos buckets comunes, la respuesta es «Datos insuficientes».

**No se promete ninguna otra divisa.** Cuando Aurix admita una tercera, entra
aquí con su pareja verificada o no entra.

### Que la conversión hace trabajo real

Medido con el motor completo (misma cartera, mismo rango, sólo cambia la base):

| rango | comparador | diferencia en USD | diferencia en EUR |
|---|---|---|---|
| 1y | S&P 500 | +8,41 pp | +5,87 pp |
| 1y | Nasdaq 100 | +3,27 pp | +0,60 pp |
| 1y | Bitcoin | +29,43 pp | +26,57 pp |
| 1y | Oro | +30,18 pp | +28,14 pp |

Si el FX fuese un no-op, las dos columnas serían idénticas. No lo son.

## Alineación

- El **bucket** es la mediana de intervalo de la serie **más gruesa** de las dos.
  Se deriva de los datos; no es un umbral elegido.
- De cada serie se toma el **último valor de cada bucket**. Un bucket sin
  observación no existe: no se rellena, no se arrastra y no se interpola.
- Se usa la **intersección** de buckets y se normaliza a 100 **después** de
  encontrar el primero común — nunca antes, porque normalizar por separado
  compararía dos orígenes distintos.
- La diferencia se publica en **puntos porcentuales**: `(mío − 100) − (otro − 100)`.

## Reproducir la sonda

```
curl -s 'https://isa-portfolio-ten.vercel.app/api/prices/history-yahoo?symbol=%5ENDX&range=1y'
curl -s 'https://isa-portfolio-ten.vercel.app/api/prices/history-yahoo?symbol=EURUSD%3DX&range=30d'
```

El gate focal del comparador (§6 en `AURIX-ADVANCED-INTELLIGENCE-CLOSURE-harness.js`)
corre **sin red**, con el adaptador simulado: lo que certifica es la alineación,
la normalización, el FX y los estados, no la disponibilidad del proveedor — que
es lo que documenta esta ficha.
