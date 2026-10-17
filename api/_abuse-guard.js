// SECURITY HARDENING V3 — defensas LOCALES contra abuso de las rutas públicas de datos de mercado.
//
// Prefijo `_`: Vercel no lo publica como función (Hobby = 12 Serverless + 1 Edge, sin margen).
//
// LÍMITE DECLARADO: todo lo de aquí vive en la memoria de UNA instancia serverless. No es un límite
// global — varias instancias en paralelo multiplican el cupo y un arranque en frío lo resetea. Lo que
// sí garantiza es que una instancia caliente no amplifica una ráfaga hacia los proveedores ni crece
// en memoria sin tope. El límite global es el Firewall de Vercel (acción manual del founder).
//
// Nada de esto toca precios: sólo decide si se pide al proveedor, y cuánto se recuerda.

// Clave de cliente. En Vercel `x-real-ip` / `x-forwarded-for` los fija la plataforma; fuera de ella
// son falsificables, por eso además existen presupuestos GLOBALES por instancia (`global`), que no
// dependen de ninguna cabecera.
export function clientKey(req) {
  const h = (req && req.headers) || {};
  const real = typeof h['x-real-ip'] === 'string' ? h['x-real-ip'].trim() : '';
  if (real) return real.slice(0, 64);
  const xff = typeof h['x-forwarded-for'] === 'string' ? h['x-forwarded-for'].split(',')[0].trim() : '';
  if (xff) return xff.slice(0, 64);
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

// Ventana fija por clave, con tope de claves: una ráfaga de IPs distintas no hace crecer el mapa.
export function createRateLimiter({ limit, windowMs, maxKeys = 5000 }) {
  const buckets = new Map(); // key → { start, count }
  function prune(now) {
    for (const [k, b] of buckets) if (now - b.start >= windowMs) buckets.delete(k);
    while (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value);
  }
  return {
    // true = permitido (y consumido); false = límite alcanzado.
    take(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b || now - b.start >= windowMs) {
        if (!b && buckets.size >= maxKeys) prune(now);
        b = { start: now, count: 0 };
        buckets.set(key, b);
      }
      if (b.count >= limit) return false;
      b.count++;
      return true;
    },
    size() { return buckets.size; },
  };
}

// Caché con caducidad y tamaño máximo (expulsa la entrada más antigua).
export function createTtlCache({ max, ttlMs }) {
  const map = new Map(); // key → { value, expiresAt }
  return {
    get(key, now = Date.now()) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now) { map.delete(key); return undefined; }
      return hit.value;
    },
    set(key, value, ttl = ttlMs, now = Date.now()) {
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: now + ttl });
      while (map.size > max) map.delete(map.keys().next().value);
    },
    size() { return map.size; },
  };
}

// Mensaje de error seguro para el cliente: sólo códigos internos conocidos, nunca texto del proveedor.
export function safeErrorCode(err, prefix) {
  const msg = (err && err.message) || '';
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'upstream_timeout';
  const re = new RegExp('^' + prefix + '[a-z0-9_]{1,40}$');
  return re.test(msg) ? msg : 'upstream_error';
}
