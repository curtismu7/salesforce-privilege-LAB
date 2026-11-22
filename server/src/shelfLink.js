// shelf-link service: server side. Every -LAB app mounts GET /api/shelf, which returns the shelf (launcher) URL from SHELF_URL. This lab reads it from
// the environment only; settings.js has already loaded this lab's OWN .env (beside docker-compose.yml) into the environment at start-up. No other file is
// read, and no host is hardcoded (repo text carries only .invalid/.example names): unconfigured, or a value that is not a plain http(s) URL, means
// shelfUrl null and the web component renders nothing.
export function validShelfUrl(raw) {
  const v = String(raw ?? '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  if (!v || v.length > 300 || /[\s\u0000-\u001f]/.test(v)) return null;
  let u; try { u = new URL(v); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.search || u.hash) return null;
  return v;
}

export function shelfInfo(env = process.env) {
  return { shelfUrl: validShelfUrl(env.SHELF_URL) };
}

export function mountShelfRoute(router, { env = process.env } = {}) {
  router.get('/shelf', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(shelfInfo(env));
  });
}
