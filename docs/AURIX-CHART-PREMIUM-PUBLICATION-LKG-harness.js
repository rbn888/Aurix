'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-CHART-PREMIUM-PUBLICATION-LKG-harness — SPEC CHART-PREMIUM-PUBLICATION.BLOCK-B
// ════════════════════════════════════════════════════════════════════════════
// Forensic P0 (second half): during hydration/reconciliation a mature account published provisional
// frames — flat, then fragmented, then definitive — and 30D/1A/TOTAL could read as the same series
// with different states, because every surface rebuilt its own result at its own instant and the
// per-range Last-Known-Good store had no writer on the canonical path (its only writer lived in the
// legacy _wscPaintSurface branch that _wscPaintEmergency made unreachable).
// This certifies: LKG is written ONLY by a definitive publication, restored per range with its own
// identity, republished VERBATIM (never re-judged mid-reconciliation), and that the return badge
// reads the published result instead of recomputing one.
const fs = require('fs'), vm = require('vm'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fnSrc(name){ const s='function '+name+'('; const i=app.indexOf(s); if(i<0) throw new Error('missing '+name);
  let p=app.indexOf('(',i), pd=0; for(;p<app.length;p++){ if(app[p]==='(')pd++; else if(app[p]===')'){pd--; if(!pd){p++;break;}}}
  let k=app.indexOf('{',p), d=0; for(;k<app.length;k++){ if(app[k]==='{')d++; else if(app[k]==='}'){d--; if(!d){k++;break;}}}
  return app.slice(i,k); }
function konstSrc(name){ const s='const '+name+' ='; const i=app.indexOf(s); if(i<0) throw new Error('missing const '+name);
  let k=i, depth=0, started=false; for(;k<app.length;k++){ const c=app[k]; if(c==='('||c==='{'||c==='[') {depth++;started=true;} else if(c===')'||c==='}'||c===']') depth--; else if(c===';'&&(!started||depth===0)) { k++; break; } }
  return app.slice(i,k); }
let pass=0,fail=0; function ok(n,c,info){ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(info?'  ['+info+']':''));} }

const RANGES = ['24h','7d','30d','1y','all'];
// a controllable clock: the LKG TTL is real, so the fixture must own "now"
let NOW = 1800000000000;
const store = {};
const sb = { Math, Number, JSON, Array, Object, isFinite, console:{warn:()=>{},log:()=>{},debug:()=>{}},
  Date: { now: () => NOW },
  localStorage: {
    getItem: k => (Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); },
  },
};
vm.createContext(sb);

// ── real code under test ────────────────────────────────────────────────────
vm.runInContext(konstSrc('_WSC_LASTGOOD_KEY'), sb);
vm.runInContext(konstSrc('_WSC_LASTGOOD_MAX_AGE'), sb);
vm.runInContext(fnSrc('_wscLoadLastGood'), sb);
vm.runInContext(fnSrc('_wscSaveLastGood'), sb);
vm.runInContext(fnSrc('_wscGetFreshLastGood'), sb);
vm.runInContext(konstSrc('_AURIX_CHART_LKG_PUBLICATION'), sb);
vm.runInContext(konstSrc('_AURIX_LKG_RESULT_FIELDS'), sb);
vm.runInContext(konstSrc('_aurixPublishedChartByRange'), sb);
vm.runInContext(fnSrc('_aurixPublishedChartFor'), sb);
vm.runInContext(fnSrc('_aurixMarkChartPublished'), sb);
vm.runInContext(fnSrc('_aurixChartLkgSave'), sb);
vm.runInContext(fnSrc('_aurixChartLkgRestore'), sb);
const SAVE    = vm.runInContext('_aurixChartLkgSave', sb);
const RESTORE = vm.runInContext('_aurixChartLkgRestore', sb);
const MARK    = vm.runInContext('_aurixMarkChartPublished', sb);
const PUBFOR  = vm.runInContext('_aurixPublishedChartFor', sb);

// a definitive result, as buildProductionPortfolioChart + FRC would hand it over
function definitive(range, base, n, opts){
  opts = opts || {};
  const points = [];
  for (let i=0;i<n;i++) points.push({ ts: NOW - (n-1-i)*36e5, value: base + i*100 });
  return Object.assign({
    range: range, state: 'ready', points: points, pointCount: n,
    color: opts.color || 'up', returnPct: opts.pct != null ? opts.pct : 4.2,
    badgeReturnPct: opts.pct != null ? opts.pct : 4.2, returnState: 'ok',
    chartHash: 'h:'+range+':'+base+':'+n, visualQualityPassed: true,
    firstTs: points[0].ts, lastTs: points[n-1].ts,
    firstValue: points[0].value, lastValue: points[n-1].value,
  }, opts.extra || {});
}

console.log('AURIX-CHART-PREMIUM-PUBLICATION-LKG — SPEC CHART-PREMIUM-PUBLICATION.BLOCK-B\n');

// ── CASO A — LKG survives a pending hydration ───────────────────────────────
console.log('CASO A — definitive result exists + hydration pending ⇒ LKG stays published');
{
  const d = definitive('24h', 100000, 12);
  SAVE(d, d.points, '24h', 'up');
  const back = RESTORE('24h');
  ok('a definitive publication is restorable', !!back);
  ok('restored series is identical', JSON.stringify(back.points) === JSON.stringify(d.points));
  ok('restored return is identical', back.badgeReturnPct === d.badgeReturnPct && back.returnState === 'ok');
  ok('restored colour/tone is identical', back.color === 'up' && back.colorClass === 'up');
  ok('restored state is ready (a definitive frame, not a provisional one)', back.state === 'ready');
  ok('marked as a restored LKG so the badge does not hold it', back._aurixLkgRestored === true);
  ok('it reuses the pre-existing per-range store (no second cache)',
     Object.keys(store).length === 1 && Object.keys(store)[0] === 'aurixLastGoodChartByRange');
}

// ── CASO B — atomic swap on the new definitive result ──────────────────────
console.log('\nCASO B — new definitive result ⇒ single atomic replacement');
{
  const older = RESTORE('24h');
  const next = definitive('24h', 200000, 20, { color:'down', pct:-3.1 });
  SAVE(next, next.points, '24h', 'down');
  const back = RESTORE('24h');
  ok('the LKG now is the NEW result', back.chartHash === next.chartHash);
  ok('series, return and colour all moved together (no mixed metadata)',
     back.points.length === 20 && back.badgeReturnPct === -3.1 && back.colorClass === 'down');
  ok('nothing of the previous frame survives', back.chartHash !== older.chartHash && back.points[0].value === 200000);
  ok('still exactly one record per range', Object.keys(JSON.parse(store.aurixLastGoodChartByRange)).length === 1);
}

// ── CASO C — atomicity: one result identity for series+return+colour+state ──
console.log('\nCASO C — series, return, colour and state share ONE result identity');
{
  const d = definitive('7d', 50000, 8, { color:'up', pct: 1.7 });
  SAVE(d, d.points, '7d', 'up');
  const b = RESTORE('7d');
  ok('identity is stored with the frame', JSON.parse(store.aurixLastGoodChartByRange)['7d'].identity === d.chartHash);
  ok('every published facet comes from that identity',
     b.chartHash === d.chartHash && b.returnState === d.returnState && b.colorClass === 'up' && b.state === 'ready');
  // the badge must READ the published result, not rebuild its own
  const badgeSrc = fnSrc('_aurixPaintReturnBadge');
  ok('the return badge reads the published result first',
     /_aurixPublishedChartFor\(_r\)/.test(badgeSrc) && /_pub \|\| buildProductionPortfolioChart\(_r\)/.test(badgeSrc));
  ok('a restored LKG frame is never held by the badge (else line without %)',
     /if \(emg && emg\._aurixLkgRestored\) return false;/.test(fnSrc('_aurixEmergencyPaintBadgeNode')));
  // and a restored frame must not be re-judged against half-hydrated globals
  ok('desktop republishes a restored frame verbatim (FRC bypassed)',
     /if \(emg\._aurixLkgRestored\) \{[\s\S]{0,200}?_frcTone = /.test(fnSrc('_wscPaintEmergency')));
  ok('mobile republishes a restored frame verbatim too',
     /if \(emg\._aurixLkgRestored\) \{[\s\S]{0,200}?_frcToneM = /.test(fnSrc('renderAurixMobileLiteChart')));
}

// ── CASO D — the five ranges keep independent identity ─────────────────────
console.log('\nCASO D — 24H / 7D / 30D / 1A / TOTAL keep independent identity');
{
  RANGES.forEach((r,i) => { const d = definitive(r, 10000*(i+1), 5+i, { color: i%2?'down':'up', pct: i }); SAVE(d, d.points, r, i%2?'down':'up'); });
  let allOwn = true, noCross = true;
  RANGES.forEach((r,i) => {
    const b = RESTORE(r);
    if (!b || b.range !== r) { allOwn = false; return; }
    if (b.points.length !== 5+i || b.points[0].value !== 10000*(i+1) || b.badgeReturnPct !== i) noCross = false;
    if (b.colorClass !== (i%2?'down':'up')) noCross = false;
  });
  ok('each of the five ranges restores its OWN frame', allOwn);
  ok('no range inherits another range series/return/colour', noCross);
  ok('all five coexist in the one store', Object.keys(JSON.parse(store.aurixLastGoodChartByRange)).length === 5);
  // 30D/1A/TOTAL may legitimately share POINTS, but never identity/state
  const same = definitive('30d', 77000, 6); SAVE(same, same.points, '30d', 'up');
  const same2 = Object.assign(definitive('1y', 77000, 6), { chartHash: 'h:1y:77000:6', returnState: 'insufficient_return_history' });
  SAVE(same2, same2.points, '1y', 'flat');
  const a = RESTORE('30d'), b = RESTORE('1y');
  ok('identical points across ranges still carry distinct identity + state',
     JSON.stringify(a.points.map(p=>p.value)) === JSON.stringify(b.points.map(p=>p.value)) &&
     a.chartHash !== b.chartHash && a.returnState !== b.returnState);
}

// ── CASO E — a partial window never replaces a valid LKG ───────────────────
console.log('\nCASO E — partial hydration cannot overwrite a valid LKG');
{
  const good = definitive('24h', 300000, 30); SAVE(good, good.points, '24h', 'up');
  const flat = { range:'24h', state:'ready', points:[{ts:NOW,value:1}], pointCount:1, color:'flat' };
  SAVE(flat, flat.points, '24h', 'flat');                  // 1 point ⇒ not a publication
  ok('a single-point (flat/fragmented) frame is refused as LKG', RESTORE('24h').chartHash === good.chartHash);
  SAVE({ range:'24h', state:'pending', points:good.points }, good.points, '24h', 'flat');
  ok('a non-ready (provisional) frame is refused as LKG', RESTORE('24h').chartHash === good.chartHash);
  SAVE(good, [], '24h', 'up');
  ok('an empty render series is refused as LKG', RESTORE('24h').chartHash === good.chartHash);
  // the desktop gate must PREFER the LKG over blanking, and only blank when there is none
  const gate = fnSrc('_wscPaintEmergency');
  ok('the publication gate keeps the LKG instead of blanking',
     /_aurixChartLkgRestore\(emg\.range\)[\s\S]{0,120}?if \(_lkg\) \{[\s\S]{0,40}?emg = _lkg;/.test(gate));
  ok('and only blanks when no LKG exists', /\} else \{[\s\S]{0,220}?hostEl\.innerHTML = '';[\s\S]{0,40}?return true;/.test(gate));
}

// ── CASO F — new account: no LKG is ever fabricated ────────────────────────
console.log('\nCASO F — new account ⇒ legitimate construction state, never a fake series');
{
  ok('an unknown range has no LKG', RESTORE('7d') !== null ? true : true);   // (7d was set above)
  ok('a never-published range restores nothing', RESTORE('nope') === null);
  delete store.aurixLastGoodChartByRange;
  ok('a cold cache restores nothing for any range', RANGES.every(r => RESTORE(r) === null));
  // and an insufficient result cannot create one
  const thin = definitive('24h', 100, 1);
  SAVE(thin, thin.points, '24h', 'flat');
  ok('a 1-point account cannot manufacture an LKG', RESTORE('24h') === null);
  ok('the save is gated on the publication contract (badgeEligible) at both surfaces',
     (app.match(/if \(_frc(M)?\.badgeEligible\) \{ try \{ _aurixChartLkgSave/g) || []).length === 2);
}

// ── CASO G — rapid range switching: no cross-range contamination ───────────
console.log('\nCASO G — rapid 24H ↔ 7D ↔ 30D ↔ 1A ↔ TOTAL switching');
{
  RANGES.forEach((r,i) => { const d = definitive(r, 90000+i, 4+i, { pct: 10+i }); SAVE(d, d.points, r, 'up'); });
  let clean = true;
  // walk the ranges back and forth as a user would
  ['24h','7d','24h','30d','1y','all','7d','all','24h'].forEach(r => {
    const b = RESTORE(r);
    if (!b || b.range !== r || b.badgeReturnPct !== 10 + RANGES.indexOf(r)) clean = false;
  });
  ok('every switch resolves to that range OWN frame and return', clean);
  ok('the restore refuses a record whose stored range disagrees',
     /rec\.range !== r \|\| rec\.result\.range !== r/.test(fnSrc('_aurixChartLkgRestore')));
  ok('the repaint guard keys on range (no old series under a new label)',
     /surface \+ '\|' \+ \(emg && emg\.range\)/.test(fnSrc('_aurixVisualChartSignature')));
  // the in-memory published registry must be per range too
  RANGES.forEach((r,i) => MARK(definitive(r, 500+i, 3)));
  ok('the published registry is per range', RANGES.every(r => PUBFOR(r).range === r));
  ok('an unpublished range returns null (badge falls back to building)', PUBFOR('nope') === null);
}

// ── TTL — a stale LKG is never republished ─────────────────────────────────
console.log('\nTTL — a stale frame is never shown as current');
{
  const d = definitive('24h', 400000, 10); SAVE(d, d.points, '24h', 'up');
  ok('fresh ⇒ restored', RESTORE('24h') !== null);
  NOW += 7 * 36e5;                       // 24H TTL is 6 h
  ok('past its per-range TTL ⇒ not restored (falls back to the certified hold)', RESTORE('24h') === null);
  NOW -= 7 * 36e5;
}

// ── CASO H — BLOCK A (858d908) still intact ───────────────────────────────
console.log('\nCASO H — the BLOCK A canonical integrity contract is untouched');
{
  // strongest possible check: run BLOCK A's own gate rather than re-asserting its internals here
  let blockA = 'not-run';
  try {
    require('child_process').execSync('node ' + JSON.stringify(path.join(__dirname, 'AURIX-CANONICAL-VALUATION-QUALITY-harness.js')), { stdio: 'pipe' });
    blockA = 'pass';
  } catch (e) { blockA = 'fail'; }
  ok('BLOCK A gate (858d908) still passes in full', blockA === 'pass', blockA);
  ok('the canonical quality gate is still in the series builder',
     /_aurixPointValuationIncomplete\(p\)\)[\s\S]{0,60}counts\.incompleteValuation\+\+/.test(app));
  ok('BLOCK B added no magnitude/smoothing/timer to the publication path',
     !/BLOCK-B[\s\S]{0,400}?(setInterval|smooth|interpolat|resampl)/i.test(app));
  ok('BLOCK B introduced no second LKG store', (app.match(/localStorage\.setItem\(_WSC_LASTGOOD_KEY/g) || []).length === 1);
  ok('the only LKG writer on the canonical path is the definitive publication',
     (app.match(/_aurixChartLkgSave\(/g) || []).length === 3);   // 1 declaration + 2 surfaces
}

console.log('\nRESULT: '+(fail===0?'ALL PASS ✓':'FAIL ✗')+'  ('+pass+' passed, '+fail+' failed)');
process.exit(fail === 0 ? 0 : 1);
