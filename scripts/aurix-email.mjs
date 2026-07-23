// ════════════════════════════════════════════════════════════════════════════
// AURIX-EMAIL — the ONE shared institutional email renderer (structure + branding).
// ════════════════════════════════════════════════════════════════════════════
// Every Aurix email (OTP, welcome, launch, …) is built from the SAME shell
// (email/aurix-base-template.html). Content varies via a few slots; the action
// area varies via a single ACTION_BLOCK (a CTA, the OTP code, or nothing). This
// keeps structure/branding identical and content separate — no duplicated HTML.
//
//   renderEmail({ preheader, title, bodyParas, actionBlock, closing, unsubscribeUrl, year })
//   ctaBlock(text, url, fallbackUrl)   → bulletproof button + fallback link
//   otpCodeBlock(codeHtml)             → the large, high-contrast verification code
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(ROOT, 'email', 'aurix-base-template.html');

export function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Bulletproof CTA (Outlook VML + standard anchor) + visible fallback link.
export function ctaBlock(text, url, fallbackUrl) {
  const u = esc(url), ft = esc(fallbackUrl || url), t = esc(text);
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
              Or paste this link into your browser:<br>
              <a href="${u}" target="_blank" rel="noopener noreferrer" style="color:#2684FF; text-decoration:underline;">${ft}</a>
            </td>
          </tr>`;
}

// The OTP verification code as the hero: large, letter-spaced, high-contrast, on an elevated
// blue-tinted plate, comfortably selectable. NO buttons, NO links (never leave the auth flow).
// `codeHtml` is the code string OR a provider variable literal (e.g. Supabase `{{ .Token }}`).
export function otpCodeBlock(codeHtml) {
  return `<tr>
            <td class="aurix-pad" align="center" style="padding:24px 40px 30px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center" style="background:#0C1424; border:1px solid rgba(38,132,255,0.45); border-radius:12px; padding:24px 16px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Courier New',monospace; font-size:40px; line-height:1.1; font-weight:800; letter-spacing:10px; color:#FFFFFF; text-indent:10px;">${codeHtml}</div>
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
export function renderEmail({ preheader = '', title = '', bodyParas = [], actionBlock = '', closing = '', footerNote = '', year = '2026' } = {}) {
  const shell = fs.readFileSync(SHELL, 'utf8');
  const bodyHtml = (bodyParas || []).map(p => `<p style="margin:0 0 16px 0;">${esc(p)}</p>`).join('\n              ');
  return shell
    .replaceAll('{{PREHEADER}}', esc(preheader))
    .replaceAll('{{TITLE}}', esc(title))
    .replaceAll('{{BODY_HTML}}', bodyHtml)
    .replaceAll('{{ACTION_BLOCK}}', actionBlock || '')
    .replaceAll('{{CLOSING}}', esc(closing))
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
export function renderWelcomeEmail(unsubscribeUrl = 'mailto:unsubscribe@aurixsystem.io?subject=unsubscribe') {
  return renderEmail({
    preheader: 'Thank you for joining us. Your journey starts today.',
    title: 'Welcome to Aurix.',
    bodyParas: [
      'Thank you for joining us.',
      'Today marks the beginning of your journey with Aurix.',
      'Our mission is simple: to help you understand, organize and grow your wealth from one private, intelligent platform.',
      'From today, you can track your stocks, ETFs, funds, crypto, precious metals, real estate, cash and more—all in one place.',
      'This is only the beginning.',
      'Over the coming months, Aurix will continue to evolve with new intelligence capabilities, financial tools and features designed to help you make better financial decisions.',
      "We're grateful to have you with us from the very beginning.",
    ],
    actionBlock: '',
    closing: 'Welcome to Aurix.',
    footerNote: marketingFooter(unsubscribeUrl),
  });
}
