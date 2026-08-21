'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-MARKET-SEARCH-PARITY — SPEC MARKET EXCELLENCE B3 (delta check)
// ════════════════════════════════════════════════════════════════════════════
// B3 quedó ABSORBIDO por Asset Discovery & Identity salvo UN delta: la línea de
// identidad de la fila de Market no pintaba red ni contrato, así que los tokens
// que comparten ticker (USDC ×5, HYPE ×4 en la API real) se leían idénticos en
// Market mientras Add Asset ya los distinguía. Este harness fija la paridad:
// mismo motor / mismo ranking / mismo retrieval / misma dedupe canónica, y ahora
// también la misma desambiguación visible.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };
const app = read('app.js');
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, st = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; st = true; }
    else if (src[k] === '}') { d--; if (st && !d) return src.slice(i, k + 1); }
  }
  return '';
}

console.log('AURIX-MARKET-SEARCH-PARITY — SPEC MARKET EXCELLENCE B3\n');

const disc   = fnSource(app, '_aurixMktDiscover');
const bridge = fnSource(app, '_searchResultToMarketItem');
const row    = fnSource(app, 'renderMarketItem');
const engine = fnSource(app, 'searchAllAssets');
const byFilt = fnSource(app, 'searchByFilter');

// ── 1. Un solo motor, un solo ranking, un solo retrieval ───────────────────
console.log('1 — Market y Add Asset comparten TODO el pipeline (lo ya absorbido):');
ok('1.1 Market entra por `searchAllAssets`, el mismo owner que Add Asset',
   /await searchAllAssets\(q,/.test(disc));
ok('1.2 Add Asset entra por el MISMO owner (el filtro es una proyección, no un motor)',
   /return searchAllAssets\(query, signal, filter\)/.test(byFilt));
ok('1.3 no hay un segundo buscador de Market',
   (app.match(/^async function searchAllAssets\(/gm) || []).length === 1
   && !/function _aurixMkt(Search|Query|Find)Assets?\(/.test(app));
ok('1.4 un único ranker en todo el bundle',
   (app.match(/^function _aurixRankSearchResults\(/gm) || []).length === 1
   && !/function _aurixMkt(Rank|Score)[A-Za-z]*\(/.test(app));
ok('1.5 el ranking vive DENTRO del motor: los dos consumidores lo reciben igual',
   /_aurixRankSearchResults\(_aurixSearchProject\(merged, filter\), query\)/.test(engine));
ok('1.6 catalog retrieval (ETF + fondos curados) dentro del motor, antes del merge',
   /_aurixSearchEtfsLocal\(query\)/.test(engine) && /_aurixSearchFundsLocal\(query\)/.test(engine)
   && /\[\.\.\.curatedEtfs, \.\.\.funds, \.\.\.metals, \.\.\.yEnriched, \.\.\.cryptoItems\]/.test(engine));
ok('1.7 dedupe por identidad canónica para cripto (nunca por símbolo)',
   /_aurixCanonicalAssetKey\(item\)/.test(engine) && /'CANON:'/.test(engine));
ok('1.8 dedupe ISIN-first + ticker exacto para el resto',
   /'ISIN:' \+ isin/.test(engine) && /'TK:' \+ String\(item\.ticker/.test(engine));
ok('1.9 búsqueda por contrato dentro del motor ⇒ la reciben los dos',
   /_aurixLooksLikeContract\(query\)/.test(engine) && /_aurixSearchByContract\(query, signal\)/.test(engine));
ok('1.10 Market no filtra localmente MARKET_DATA en paralelo',
   !/const filtered = data\.filter\(item => \{[\s\S]{0,200}sym\.includes\(q\)/.test(appCode));
ok('1.11 la marca de ambigüedad se aplica en el motor, no en una vista',
   /_aurixMarkCryptoAmbiguity\(ranked\)/.test(engine)
   && (app.match(/_aurixMarkCryptoAmbiguity\(/g) || []).length === 2);

// ── 2. La identidad canónica llega intacta a la fila de Market ─────────────
console.log('\n2 — El puente a fila de Market no pierde identidad:');
for (const f of ['canonicalKey', 'chain', 'networkId', 'contract', 'matchedBy', 'symbolCollision', 'isin', 'exchange', 'marketCapRank', 'priceable']) {
  ok('2.x el puente conserva `' + f + '`', new RegExp('(^|\\s)' + f + ':').test(bridge));
}

// ── 3. EL DELTA: la fila desambigua igual que Add Asset ───────────────────
console.log('\n3 — Desambiguación visible en la fila de Market (el delta corregido):');
ok('3.1 la fila calcula si necesita identidad extendida', /_idNeedsChain/.test(row));
ok('3.2 la regla es la misma: llegada por contrato O colisión de símbolo',
   /item\.matchedBy === 'contract' \|\| item\.symbolCollision === true/.test(row));
ok('3.3 sólo aplica a cripto', /String\(item\.type \|\| ''\)\.toLowerCase\(\) === 'crypto'/.test(row));
ok('3.4 la red SUSTITUYE a la etiqueta de tipo (no se apilan las dos)',
   /_idChain\s*\?\s*`<span>\$\{escHtml\(_idChain\)\}<\/span>`\s*:\s*\(item\.type/.test(row));
ok('3.5 el contrato se abrevia con el helper ya existente',
   /_aurixShortContract\(item\.contract\)/.test(row));
ok('3.6 nada se deduce: sin red o sin contrato no se escribe el segmento',
   /\(_idNeedsChain && item\.chain\) \? String\(item\.chain\) : ''/.test(row)
   && /_idContract \? `<span>/.test(row));

// Ejecución REAL de la línea de identidad, con los casos focales de la API real.
// (`USDC` devuelve 5 tokens con el mismo ticker; `HYPE`, 4.)
const seg = (() => {
  const m = /const idMeta = \[([\s\S]*?)\]\.filter\(Boolean\)\.join\(/.exec(row);
  const i0 = row.indexOf('const _idNeedsChain');
  const i1 = row.indexOf('const idMeta');
  const pre = (i0 >= 0 && i1 > i0) ? row.slice(i0, i1) : null;
  if (!m || !pre) return null;
  try {
    return new Function('item', 'escHtml', '_aurixMktShortType', '_aurixShortContract',
      pre + '\nconst idMeta = [' + m[1] + '].filter(Boolean);\nreturn idMeta.join(" · ");')
      .bind(null);
  } catch (_) { return null; }
})();
const esc = s => String(s);
const shortC = a => { const s = String(a || ''); return s.length <= 12 ? s : s.slice(0, 6) + '…' + s.slice(-4); };
const shortT = t => ({ crypto: 'Cripto', stock: 'Acción', etf: 'ETF' })[String(t).toLowerCase()] || String(t);
const line = it => seg ? seg(it, esc, shortT, shortC).replace(/<[^>]+>/g, '') : null;
ok('3.7 la línea de identidad es ejecutable', typeof seg === 'function');
if (typeof seg === 'function') {
  const usdcMain    = { symbol: 'USDC', type: 'crypto', currency: 'USD', symbolCollision: true };
  const usdcBeam    = { symbol: 'USDC', type: 'crypto', currency: 'USD', symbolCollision: true, chain: 'Beam', contract: '0x76bf5e7d1234567890abcdef1234567890abcdef' };
  const usdcAnubis  = { symbol: 'USDC', type: 'crypto', currency: 'USD', symbolCollision: true, chain: 'Anubis', contract: '0x7dd9c7cb1234567890abcdef1234567890abcdef' };
  const hypeLiquid  = { symbol: 'HYPE', type: 'crypto', currency: 'USD', symbolCollision: true, chain: 'Hyperliquid', contract: '0x0d01dc561234567890abcdef1234567890abcdef' };
  const hypeBolic   = { symbol: 'HYPE', type: 'crypto', currency: 'USD', symbolCollision: true, chain: 'Ethereum', contract: '0x85225ed71234567890abcdef1234567890abcdef' };
  const btc         = { symbol: 'BTC', type: 'crypto', currency: 'USD' };
  const eth         = { symbol: 'ETH', type: 'crypto', currency: 'USD' };
  const byContract  = { symbol: 'USDC', type: 'crypto', currency: 'USD', matchedBy: 'contract', chain: 'Ethereum', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' };
  const voo         = { symbol: 'VOO', type: 'etf', currency: 'USD', issuer: 'Vanguard', exchange: 'NYSE Arca' };
  const vwce        = { symbol: 'VWCE.DE', type: 'etf', currency: 'EUR', issuer: 'Vanguard', exchange: 'XETRA' };

  ok('3.8 USDC: los tokens que comparten ticker YA NO se leen iguales',
     line(usdcBeam) !== line(usdcAnubis) && line(usdcBeam) !== line(usdcMain),
     line(usdcBeam) + ' / ' + line(usdcAnubis) + ' / ' + line(usdcMain));
  ok('3.9 USDC puenteado muestra red y contrato abreviado',
     line(usdcBeam) === 'USDC · Beam · 0x76bf…cdef · USD', line(usdcBeam));
  ok('3.10 el USDC canónico (sin red publicada) conserva la etiqueta de tipo de siempre',
     line(usdcMain) === 'USDC · Cripto · USD', line(usdcMain));
  ok('3.11 HYPE: Hyperliquid se distingue de los demás HYPE',
     line(hypeLiquid) !== line(hypeBolic) && /Hyperliquid/.test(line(hypeLiquid)),
     line(hypeLiquid) + ' / ' + line(hypeBolic));
  ok('3.12 un resultado por CONTRATO muestra red + contrato',
     line(byContract) === 'USDC · Ethereum · 0xA0b8…eB48 · USD', line(byContract));
  ok('3.13 BTC y ETH (sin colisión) siguen EXACTAMENTE igual que antes',
     line(btc) === 'BTC · Cripto · USD' && line(eth) === 'ETH · Cripto · USD',
     line(btc) + ' / ' + line(eth));
  ok('3.14 VOO / VWCE (no cripto) intactos: ticker · tipo · gestora · mercado · divisa',
     line(voo) === 'VOO · ETF · Vanguard · NYSE Arca · USD'
     && line(vwce) === 'VWCE.DE · ETF · Vanguard · XETRA · EUR',
     line(voo) + ' / ' + line(vwce));
  ok('3.15 sin datos de identidad extendida no aparece ningún segmento vacío',
     !/·\s*·/.test(line(usdcMain)) && !/·\s*$/.test(line(btc)));
}

// ── 4. Alcance: nada fuera del owner ──────────────────────────────────────
console.log('\n4 — Alcance del delta:');
ok('4.1 el motor de búsqueda NO se ha tocado (sigue con su corte de 10 y su proyección)',
   /\.slice\(0, 10\)/.test(engine) && /_aurixSearchProject\(merged, filter\)/.test(engine));
ok('4.2 el subtítulo certificado de Add Asset sigue siendo el mismo owner intacto',
   (app.match(/^function _aurixSearchSubtitle\(/gm) || []).length === 1
   && /const needsId = !!\(a\.matchedBy === 'contract' \|\| a\.symbolCollision\);/.test(app));
ok('4.3 no se ha creado un segundo constructor de subtítulo',
   (app.match(/_aurixShortContract\(/g) || []).length === 3);
ok('4.4 el contrato de estado B1 y el ALL de cripto B1.1 no se han tocado',
   /function _aurixMktDataState\(/.test(app) && /_cryptoLongHistory/.test(read('services/chart-adapters.js')));
ok('4.5 sin CSS nuevo: se reutilizan los `<span>` y el separador que ya existían',
   /class="mkt-id-sep"/.test(row) && !/mkt-id-contract/.test(read('styles.css')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
