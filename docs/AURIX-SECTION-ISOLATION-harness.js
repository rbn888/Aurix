'use strict';
// ════════════════════════════════════════════════════════════════════════════
// AURIX-SECTION-ISOLATION-harness — SPEC SECTION-ISOLATION-1
// ════════════════════════════════════════════════════════════════════════════
// OWNER: `_applyTab(tab)` — the single navigation/render controller for the main sections (Dashboard=main,
// Intelligence/Market=#tabPlaceholder, Workspace=#aurixWorkspace). BUG: it hid inactive hosts with inline
// `display:none`, but the premium-preview stylesheet forces `display:flex!important` on any host that still
// `.premium-preview-stage` (line ~43368) — `!important` beats inline — and `_applyTab` never UNMOUNTED the
// hidden host, so once Intelligence + Workspace had each been visited both hosts stayed force-visible in every
// section (Dashboard showed Intelligence/Workspace; Intelligence showed Workspace; etc.). FIX: `_applyTab`
// unmounts the two DYNAMIC hosts (clears innerHTML) on every navigation, then re-mounts only the active one —
// so `:has()` no longer matches a hidden host. This harness loads the REAL `_applyTab` + the REAL invariant
// `_aurixSectionIsolationInvariant` under a DOM stub that faithfully models the `:has→display:flex!important`
// CSS override, and drives the exact nav sequences from the SPEC harness list.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function braceSlice(s) { let k = app.indexOf('{', s), d = 0; for (; k < app.length; k++) { const c = app[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } } } return app.slice(s, k); }
function fnSrc(n) { const i = app.indexOf('function ' + n + '('); if (i < 0) throw new Error('missing fn ' + n); return braceSlice(i); }

let pass = 0, fail = 0;
function ok(n, c, extra) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  →  ' + extra : '')); } }

// ── faithful DOM stub ─────────────────────────────────────────────────────────
const PREVIEW = '<style>...</style><div class="premium-preview-stage"><div class="premium-preview-card">preview</div></div>';
function mkEl(id) {
  return { id, _html: '', style: { display: '' },
    set innerHTML(v) { this._html = String(v == null ? '' : v); }, get innerHTML() { return this._html; },
    querySelector(sel) { return (sel === '.premium-preview-stage' && this._html.indexOf('premium-preview-stage') >= 0) ? {} : null; },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { on ? this._s.add(c) : this._s.delete(c); } }, contains(c) { return this._s.has(c); } } };
}
const els = { main: mkEl('main'), tabPlaceholder: mkEl('tabPlaceholder'), aurixWorkspace: mkEl('aurixWorkspace'), assetDetailSection: mkEl('assetDetailSection') };
els.main._tag = 'main';
const body = mkEl('body');
const document = {
  body,
  querySelector(sel) { return sel === 'main' ? els.main : null; },
  getElementById(id) { return els[id] || null; },
};
// getComputedStyle models the premium-preview override: a dynamic host that still contains a
// `.premium-preview-stage` is FORCED display:flex (matches `.tab-placeholder:has(...)/.aurix-workspace:has(...)
// {display:flex!important}` beating the inline display:none) — exactly the leak vector.
function getComputedStyle(el) {
  const dyn = (el === els.tabPlaceholder || el === els.aurixWorkspace);
  if (dyn && el._html.indexOf('premium-preview-stage') >= 0) return { display: 'flex' };   // !important override
  const d = el.style.display;
  return { display: d === 'none' ? 'none' : (d || 'block') };
}

// ── VM context with stubbed render deps (mimic production mounts) ──────────────
const ctx = { console: { log() {} }, document, getComputedStyle, clearInterval() {}, setTimeout() {}, requestAnimationFrame() {}, cancelAnimationFrame() {}, Math, JSON, Object, Number, String, Boolean, Set };
ctx.window = {};
// state globals _applyTab reads/writes
ctx.currentTab = null; ctx.activeAssetId = null; ctx.activeCategory = null; ctx._loopInterval = null; ctx._marketInterval = null;
// dependency stubs — the render calls mount the SAME content shapes production does (non-premium ⇒ previews)
ctx.switchView = function () {};
ctx.render = function () { els.main.innerHTML = '<div class="dashboard-real">dashboard</div>'; };   // Dashboard: never a preview
ctx.updateCategoryCards = function () {};
ctx.updateBottomNavActive = function () {};
ctx.renderWorkspace = function () { els.aurixWorkspace.innerHTML = PREVIEW; };                        // non-premium ⇒ workspace preview
ctx.renderIntelligenceTab = function () { return PREVIEW; };                                          // non-premium ⇒ intelligence preview (mounted by _applyTab)
ctx._initIntelligenceCommandCenter = function () {};
ctx.renderMarket = function () { els.tabPlaceholder.innerHTML = '<div class="market-real">market</div>'; };
ctx.renderInsights = function () { return '<div class="insights-real">insights</div>'; };
ctx.startInsightRotation = function () {};
ctx.hasAurixPremiumAccess = function () { return false; };     // force the PREVIEW path (the leaking case)
ctx._aurixCurrentAuthUser = function () { return { email: 'nonpremium@example.com' }; };
vm.createContext(ctx);
vm.runInContext(fnSrc('_applyTab'), ctx);
vm.runInContext(fnSrc('_aurixSectionIsolationInvariant'), ctx);
const applyTab = t => { ctx.currentTab_prev = ctx.currentTab; vm.runInContext('_applyTab(' + JSON.stringify(t) + ')', ctx); };
const inv = () => vm.runInContext('_aurixSectionIsolationInvariant()', ctx);
const visible = () => inv().visible.slice();
const hostHtml = id => els[id]._html;
const hasStage = id => els[id]._html.indexOf('premium-preview-stage') >= 0;

// ── 1) direct load in Dashboard → only Dashboard, zero previews ────────────────
console.log('\n1) direct Dashboard:');
applyTab('home');
ok('1 only Dashboard visible', JSON.stringify(visible()) === '["main"]', JSON.stringify(visible()));
ok('1 zero Intelligence/Workspace preview nodes mounted', !hasStage('tabPlaceholder') && !hasStage('aurixWorkspace'));
ok('1 invariant ok', inv().ok, JSON.stringify(inv().reasons));

// ── 2) Dashboard → Intelligence → only Intelligence ────────────────────────────
console.log('\n2) Dashboard → Intelligence:');
applyTab('intelligence');
ok('2 only Intelligence (tabPlaceholder) visible', JSON.stringify(visible()) === '["tabPlaceholder"]', JSON.stringify(visible()));
ok('2 Workspace host empty (absent)', !hasStage('aurixWorkspace') && hostHtml('aurixWorkspace') === '');
ok('2 Dashboard hidden', getComputedStyleDisplay('main') === 'none');
ok('2 invariant ok', inv().ok, JSON.stringify(inv().reasons));

// ── 3) Intelligence → Workspace → only Workspace ───────────────────────────────
console.log('\n3) Intelligence → Workspace:');
applyTab('workspace');
ok('3 only Workspace (aurixWorkspace) visible', JSON.stringify(visible()) === '["aurixWorkspace"]', JSON.stringify(visible()));
ok('3 Intelligence host UNMOUNTED (no residual preview)', !hasStage('tabPlaceholder') && hostHtml('tabPlaceholder') === '');
ok('3 invariant ok', inv().ok, JSON.stringify(inv().reasons));

// ── 4) Workspace → Dashboard → only Dashboard, both previews absent ────────────
console.log('\n4) Workspace → Dashboard:');
applyTab('home');
ok('4 only Dashboard visible', JSON.stringify(visible()) === '["main"]', JSON.stringify(visible()));
ok('4 both previews unmounted', !hasStage('tabPlaceholder') && !hasStage('aurixWorkspace'));
ok('4 invariant ok', inv().ok, JSON.stringify(inv().reasons));

// ── 5) repeat navigation many times → never duplicates, never two active ───────
console.log('\n5) repeated navigation:');
let worst = null;
const seq = ['intelligence', 'workspace', 'home', 'workspace', 'intelligence', 'home', 'intelligence', 'workspace', 'market', 'home'];
for (let r = 0; r < 5; r++) for (const t of seq) { applyTab(t); const i = inv(); if (!i.ok || i.visible.length !== 1) { worst = { t, i }; break; } }
ok('5 exactly one active section throughout 50 navigations', worst === null, worst ? JSON.stringify(worst) : '');
// node-count stability: mounting never accumulates (each host holds at most its own current content)
applyTab('home');
ok('5 no residual after returning home (both dynamic hosts empty)', hostHtml('tabPlaceholder') === '' && hostHtml('aurixWorkspace') === '');

// ── 6) direct reload into each section → only that section ─────────────────────
console.log('\n6) direct reload per section:');
['home', 'intelligence', 'workspace', 'market'].forEach(t => {
  // simulate a fresh boot into t: reset hosts then apply
  els.tabPlaceholder.innerHTML = ''; els.aurixWorkspace.innerHTML = ''; els.main.innerHTML = '';
  applyTab(t);
  const v = visible(); const expect = t === 'home' ? 'main' : t === 'workspace' ? 'aurixWorkspace' : 'tabPlaceholder';
  ok('6 reload ' + t + ' → only ' + expect, JSON.stringify(v) === JSON.stringify([expect]) && inv().ok, JSON.stringify(v));
});

// ── 7) protection catches a residual leak (regression guard for the invariant) ──
console.log('\n7) protection detects residual leak:');
applyTab('home');
els.tabPlaceholder.innerHTML = PREVIEW;   // simulate a leaked preview in the (nominally hidden) Intelligence host
const leak = inv();
// the premium-preview `display:flex!important` override makes the leaked host genuinely visible, so the
// invariant flags it as a SECOND active section (the exact real symptom) — a residual either way.
ok('7 invariant FAILS when a leaked preview sits in a non-active host', leak.ok === false && (leak.visible.indexOf('tabPlaceholder') >= 0 || leak.residualPreviewHosts.indexOf('tabPlaceholder') >= 0), JSON.stringify(leak));
els.aurixWorkspace.innerHTML = PREVIEW; els.main.innerHTML = PREVIEW;   // simulate Dashboard containing a preview
const leak2 = inv();
ok('7 invariant FAILS when Dashboard(main) contains a preview', leak2.ok === false && leak2.reasons.indexOf('dashboard_contains_preview') >= 0, JSON.stringify(leak2.reasons));

// ── source invariants ───────────────────────────────────────────────────────────
console.log('\nsource invariants:');
const applySrc = fnSrc('_applyTab');
ok('S1 _applyTab unmounts BOTH dynamic hosts on every navigation', /if \(placeholder\) placeholder\.innerHTML = '';\s*\n\s*if \(workspaceEl\) workspaceEl\.innerHTML = '';/.test(applySrc));
ok('S2 unmount happens BEFORE the per-tab mount branches', applySrc.indexOf("placeholder.innerHTML = ''") < applySrc.indexOf("if (tab === 'home')"));
ok('S3 main (Dashboard) is never cleared by _applyTab', !/mainEl\.innerHTML\s*=/.test(applySrc));
ok('S4 SECTION-ISOLATION-1 marker + invariant + audit present', /SECTION-ISOLATION-1/.test(app) && /function _aurixSectionIsolationInvariant\(/.test(app) && /window\.aurixSectionIsolationAudit\s*=/.test(app));
ok('S5 single owner reused (no second router): only one _applyTab', (app.match(/function _applyTab\(/g) || []).length === 1);
ok('S6 preview content untouched (still one _aurixPremiumPreviewHTML owner)', (app.match(/function _aurixPremiumPreviewHTML\(/g) || []).length === 1);

function getComputedStyleDisplay(id) { return getComputedStyle(els[id]).display; }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
