// An in-process stand-in for a Salesforce org: a token endpoint that verifies the RS256 JWT-bearer assertion, and a query endpoint. Loopback only.
// It is the only "Salesforce" any test or agent ever talks to.
import http from 'node:http';
import { generateKeyPairSync, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function makeKey() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { publicKey, pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
export function tmpFile(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfpriv-'));
  const file = path.join(dir, name); fs.writeFileSync(file, text, { mode: 0o600 });
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
export const TOKEN = 'stub-access-token-for-tests-only';

export async function startStub({ publicKey, clientId, username, behavior = 'ok' }) {
  const seen = { token: [], query: [], headers: [] };
  const server = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const origin = `http://127.0.0.1:${server.address().port}`;
      seen.headers.push({ method: req.method, url: req.url.split('?')[0], traceparent: req.headers.traceparent, authorization: req.headers.authorization });
      const send = (status, obj, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
      if (req.method === 'POST' && req.url === '/services/oauth2/token') {
        seen.token.push(body);
        if (behavior === 'hang') return undefined;
        if (behavior === 'redirect') return send(302, '', { location: 'https://elsewhere.example.invalid/' });
        if (behavior === 'huge') return send(200, `{"pad":"${'x'.repeat(1_100_000)}"}`);
        if (behavior === 'bad-json') return send(200, 'not json at all');
        if (behavior === 'reject') return send(400, { error: 'invalid_grant', error_description: 'user hasn\'t approved this consumer' });
        const form = new URLSearchParams(body);
        if (behavior === 'echo-assertion') return send(400, { error: 'invalid_grant', error_description: `bad assertion ${form.get('assertion')}` });
        if (behavior === 'echo-error-field') return send(400, { error: form.get('assertion'), error_description: 'x' });
        const [h, c, s] = String(form.get('assertion') || '').split('.');
        let ok = false; let claims = {};
        try {
          claims = JSON.parse(Buffer.from(c, 'base64url').toString());
          const head = JSON.parse(Buffer.from(h, 'base64url').toString());
          ok = form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && head.alg === 'RS256'
            && verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'))
            && claims.iss === clientId && claims.sub === username && claims.aud === origin && claims.exp > Math.floor(Date.now() / 1000);
        } catch { ok = false; }
        if (!ok) return send(400, { error: 'invalid_grant', error_description: 'stub: assertion not accepted' });
        return send(200, { access_token: TOKEN, instance_url: behavior === 'other-instance' ? 'https://other.example.invalid' : origin, token_type: 'Bearer' });
      }
      if (req.method === 'GET' && req.url.startsWith('/services/data/')) {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, [{ errorCode: 'INVALID_SESSION_ID' }]);
        const q = decodeURIComponent(new URL(req.url, origin).searchParams.get('q') || '');
        seen.query.push(q);
        if (behavior === 'query-fail') return send(403, [{ errorCode: 'INSUFFICIENT_ACCESS', message: 'no' }]);
        if (/FROM PermissionSet/.test(q)) return send(200, { totalSize: 2, done: true, records: [{ Id: '0PS000000000001AAA', Label: 'Account Read Access', Name: 'Account_Read_Access' }, { Id: '0PS000000000002AAA', Label: 'Integration Access', Name: 'Integration_Access' }] });
        if (/FROM User/.test(q)) return send(200, { totalSize: 1, done: true, records: [{ Id: '005000000000001AAA', Username: 'someone@stub-org.example', Email: 'someone@stub-org.example', Name: 'Stub Person', IsActive: true }] });
        return send(400, [{ errorCode: 'MALFORMED_QUERY' }]);
      }
      return send(404, { error: 'not_found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, seen, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
