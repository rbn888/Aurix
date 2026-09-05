#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// AURIX-FOUNDER-READ-1 · generador de `AURIX_FOUNDER_READ_TOKEN`
// ════════════════════════════════════════════════════════════════════════════
// Imprime UNA credencial nueva por stdout y nada más. NO escribe ficheros, NO
// toca `.env`, NO llama a ningún servicio y NO deja rastro en el repositorio:
// el valor sólo debe existir en el entorno de Vercel del proyecto de la API y
// en el entorno de Founder Platform. Nunca se pega en un chat ni se commitea.
//
//   node scripts/aurix-founder-read-token.mjs
// ════════════════════════════════════════════════════════════════════════════

import { randomBytes } from 'node:crypto';

// 32 bytes → 43 caracteres base64url: por encima del mínimo de 32 que exige
// `api/_founder-read-token.mjs`, y sin caracteres que necesiten escaparse al
// pegarlo en un formulario o en la CLI.
const token = randomBytes(32).toString('base64url');

console.log(`
AURIX_FOUNDER_READ_TOKEN (${token.length} caracteres)

  ${token}

Pasos, en este orden:

  1) Aurix — proyecto de la API en Vercel (isa-portfolio-ten):
       vercel env add AURIX_FOUNDER_READ_TOKEN production
     …y pegar el valor cuando lo pida. Sin prefijo NEXT_PUBLIC, jamás.

  2) Founder Platform — su propio entorno, MISMO valor.

  3) Redespliegue de la API para que la variable entre en la función.

Reglas que la frontera impone por código (api/_founder-read-token.mjs):
  · <32 caracteres            ⇒ lectura DESHABILITADA (401 siempre)
  · valor compartido con otro secreto del proyecto ⇒ DESHABILITADA
  · sólo se lee de la cabecera Authorization: Bearer — nunca de cookie ni query

Este valor no vuelve a mostrarse. Si se pierde, generar otro y rotar los dos
entornos: no hay nada que migrar porque la frontera es de sólo lectura.
`);
