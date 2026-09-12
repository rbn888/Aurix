// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMAIL — the ONE shared institutional email renderer (structure + branding).
// ════════════════════════════════════════════════════════════════════════════
// Every Aurix email (OTP, welcome, launch, …) is built from the SAME shell
// (email/aurix-base-template.html). Content varies via a few slots; the action
// area varies via a single ACTION_BLOCK (a CTA, the OTP code, or nothing). This
// keeps structure/branding identical and content separate — no duplicated HTML.
//
//   renderEmail({ preheader, title, bodyParas, actionBlock, closing, unsubscribeUrl, year })
//   ctaBlock(text, url, fallbackUrl, fallbackLabel) → bulletproof button + fallback link
//   otpCodeBlock(codeHtml)             → the large, high-contrast verification code
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(ROOT, 'email', 'aurix-base-template.html');

export function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Bulletproof CTA (Outlook VML + standard anchor) + visible fallback link.
export function ctaBlock(text, url, fallbackUrl, fallbackLabel = 'Or paste this link into your browser:') {
  const u = esc(url), ft = esc(fallbackUrl || url), t = esc(text), fl = esc(fallbackLabel);
  return `<tr>
            <td class="aurix-pad" align="left" style="padding:22px 40px 6px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:52px;v-text-anchor:middle;width:520px;" arcsize="16%" strokecolor="#2684FF" fillcolor="#2684FF">
                <w:anchorlock/>
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${t}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${u}" class="aurix-cta aurix-cta-a" target="_blank" rel="noopener noreferrer" style="display:inline-block; background:#2684FF; color:#FFFFFF; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; font-weight:700; text-decoration:none; padding:15px 34px; border-radius:10px; box-shadow:0 6px 22px rgba(38,132,255,0.32); mso-padding-alt:0;">${t}</a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td class="aurix-pad" align="left" style="padding:6px 40px 30px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.5; color:#9FB0C7;">
              ${fl}<br>
              <a href="${u}" target="_blank" rel="noopener noreferrer" style="color:#2684FF; text-decoration:underline;">${ft}</a>
            </td>
          </tr>`;
}

// The OTP verification code as the hero: large, letter-spaced, high-contrast, on an elevated
// blue-tinted plate, comfortably selectable. NO buttons, NO links (never leave the auth flow).
// `codeHtml` is the code string OR a provider variable literal (e.g. Supabase `{{ .Token }}`).
// P0 — the code must NEVER split across lines, in any mobile client. A numeric code is one
// unbreakable word, so a desktop browser overflows rather than wraps; but Gmail (mobile app and
// web) and other clients inject word-break/overflow-wrap on content that reaches the edge, and
// that is what splits it. Two independent defences, because either alone can be defeated:
//   1. white-space:nowrap — inline, so it outranks an injected class rule and forbids the break.
//   2. real headroom — at 40px/10px tracking an 8-digit code measured 282px inside a 292px plate
//      on a 320px viewport: ~10px of slack, i.e. one wider font metric away from touching the
//      edge and triggering that injection. 34px/6px measures ~217px, leaving ~80px.
// 34px bold with 6px tracking keeps the code the unmistakable hero of the email. Plate padding
// trimmed 16px→12px for a little extra width. text-indent offsets the trailing letter-spacing so
// the code stays optically centred.
export function otpCodeBlock(codeHtml) {
  return `<tr>
            <td class="aurix-pad" align="center" style="padding:24px 40px 30px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center" style="background:#0C1424; border:1px solid rgba(38,132,255,0.45); border-radius:12px; padding:24px 12px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Courier New',monospace; font-size:34px; line-height:1.15; font-weight:800; letter-spacing:6px; color:#FFFFFF; text-indent:6px; white-space:nowrap; word-break:keep-all; overflow-wrap:normal;">${codeHtml}</div>
                </td></tr>
              </table>
            </td>
          </tr>`;
}

// Marketing footer note (reason + one-click unsubscribe) — for opt-in emails (welcome / launch).
// Transactional emails (OTP) pass footerNote='' → minimal corporate footer, no unsubscribe.
export function marketingFooter(unsubscribeUrl = 'mailto:unsubscribe@aurixsystem.io?subject=unsubscribe') {
  return `<span style="color:#5E6B82;">You are receiving this because you joined the Aurix waitlist.</span> <a href="${esc(unsubscribeUrl)}" style="color:#7E8CA3; text-decoration:underline;">Unsubscribe</a>.<br>`;
}

// Render the full email from the shared shell. bodyParas → <p> blocks. actionBlock → CTA/code/''.
// footerNote → marketing reason+unsubscribe, or '' for transactional (minimal) footer.
export function renderEmail({ preheader = '', title = '', bodyParas = [], actionBlock = '', closing = '', footerNote = '', signoff = 'The Aurix Team', year = '2026' } = {}) {
  const shell = fs.readFileSync(SHELL, 'utf8');
  const bodyHtml = (bodyParas || []).map(p => `<p style="margin:0 0 16px 0;">${esc(p)}</p>`).join('\n              ');
  return shell
    .replaceAll('{{PREHEADER}}', esc(preheader))
    .replaceAll('{{TITLE}}', esc(title))
    .replaceAll('{{BODY_HTML}}', bodyHtml)
    .replaceAll('{{ACTION_BLOCK}}', actionBlock || '')
    .replaceAll('{{CLOSING}}', esc(closing))
    .replaceAll('{{SIGNOFF}}', esc(signoff))
    .replaceAll('{{FOOTER_NOTE}}', footerNote || '')
    .replaceAll('{{YEAR}}', year);
}

// ── Concrete Aurix emails (content only — structure/branding come from the shell) ──

// OTP verification (Supabase Auth template). `codeVar` defaults to Supabase's {{ .Token }} variable.
export function renderOtpEmail(codeVar = '{{ .Token }}') {
  return renderEmail({
    preheader: 'Your Aurix verification code.',
    title: 'Your verification code',
    bodyParas: [
      'Use the verification code below to securely access your Aurix account.',
      'Never share this code with anyone.',
    ],
    actionBlock: otpCodeBlock(codeVar),
    closing: '',
    footerNote: '',   // transactional → minimal footer, NO unsubscribe (never leave the auth flow)
  });
}

// One-time welcome (sent ~30 min after a NEW user's first successful access).
// Tightened to 4 paragraphs / ~60 words (was 7 / ~95, −37%) so it reads in seconds with the same
// message, and given the primary CTA it previously lacked — the reader had nowhere to go.
// NO unsubscribe and no "you joined the waitlist" line: this is TRANSACTIONAL, triggered by the
// user's own registration, not an opt-in campaign — and the waitlist sentence was simply untrue for
// someone who just signed up. The launch campaign keeps marketingFooter(), which is where the
// reason + one-click unsubscribe genuinely belong. `unsubscribeUrl` stays in the signature so the
// existing call sites keep working unchanged.
// ── M.06 · §3 — EL CORREO SALE EN EL IDIOMA DE LA CUENTA ────────────────────
// El sender (api/cron/welcome-email.js) resuelve el idioma explícito de la cuenta y pide la
// variante. `renderWelcomeEmail()` sin argumentos sigue devolviendo el inglés BYTE A BYTE, así
// que el artefacto ya desplegado (email/aurix-welcome.html) no se mueve.
// El parámetro `unsubscribeUrl` anterior se retira: nunca se leía — este correo es
// TRANSACCIONAL (lo dispara el registro del propio usuario) y no lleva baja.
const WELCOME_COPY = {
  en: {
    preheader: 'Thank you for joining us. Your journey starts today.',
    title: 'Welcome to Aurix.',
    bodyParas: [
      'Thank you for joining us. Your journey with Aurix begins today.',
      'Our mission is simple: help you understand, organize and grow your wealth from one private, intelligent platform.',
      'Track your stocks, ETFs, funds, crypto, precious metals, real estate and cash — all in one place.',
      'This is only the beginning: new intelligence and financial tools are coming over the next months.',
    ],
    cta: 'Enter Aurix →',
    ctaFallback: 'Or paste this link into your browser:',
    signoff: 'The Aurix Team',
  },
  es: {
    preheader: 'Gracias por unirte. Tu recorrido empieza hoy.',
    title: 'Bienvenido a Aurix.',
    bodyParas: [
      'Gracias por unirte. Tu recorrido con Aurix empieza hoy.',
      'Nuestra misión es simple: ayudarte a entender, organizar y hacer crecer tu patrimonio desde una sola plataforma privada e inteligente.',
      'Sigue tus acciones, ETFs, fondos, cripto, metales preciosos, inmuebles y liquidez — todo en un mismo lugar.',
      'Esto es solo el principio: en los próximos meses llegarán nuevas herramientas de inteligencia y análisis financiero.',
    ],
    cta: 'Entrar en Aurix →',
    ctaFallback: 'O pega este enlace en tu navegador:',
    signoff: 'El equipo de Aurix',
  },
};

export function renderWelcomeEmail(lang = 'en') {
  const c = WELCOME_COPY[lang] || WELCOME_COPY.en;
  return renderEmail({
    preheader: c.preheader,
    title: c.title,
    bodyParas: c.bodyParas,
    actionBlock: ctaBlock(c.cta, 'https://app.aurixsystem.io', 'https://app.aurixsystem.io', c.ctaFallback),
    closing: '',                 // the duplicate "Welcome to Aurix." right above the footer is gone (it repeated the title)
    footerNote: '',              // transactional → minimal corporate footer, NO unsubscribe
    signoff: c.signoff,
  });
}
