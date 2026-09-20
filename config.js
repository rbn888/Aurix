const SUPABASE_URL = 'https://ozcasyufbknnuemllwso.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wlZsjnPGXay9jsRqcXA08Q_bVhmI7sU';

// AURIX-APP-DOMAIN-READY-1: single source of truth for the Aurix API origin,
// shared by every page (index, login, reset all load config.js first). app.js
// and services/* read window.AURIX_API_BASE and build their /api/* URLs from it.
// Default = current Vercel project during migration. When the app and its API
// are co-hosted on the custom domain, set this to '' so the app calls a
// same-origin /api (e.g. https://app.aurixsystem.io/api) with no CORS.
window.AURIX_API_BASE = 'https://isa-portfolio-ten.vercel.app';

// ── SPEC SUPREME CLOSURE §7 · ENDPOINT DEL CHAT ─────────────────────────────
// VACÍO A PROPÓSITO. La Edge Function `aurix-chat` está construida pero NO
// desplegada, y mientras esta cadena esté vacía la esfera NO promete
// conversación: sin affordance, sin panel y sin una sola petición. Es el gate
// del §7 hecho configuración en vez de código.
// Cuando el founder despliegue la función, aquí va su URL https:// y nada más.
window.AURIX_CHAT_URL = '';
