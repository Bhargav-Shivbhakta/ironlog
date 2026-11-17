// A very small Firestore client for the connector: get one document, set one document.
// It signs in as the project's service account (a key only the connector's host holds), so the
// security rules that keep students out do not apply to it. Uses only fetch and Web Crypto, so it
// runs on Cloudflare Workers and in Node.
//
// account: the service account key file (the JSON you download from Firebase), as an object.
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) } };
};
const dec = (v) => {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
export const encodeFields = (obj) => enc(obj).mapValue.fields;
export const decodeFields = (fields) => dec({ mapValue: { fields: fields || {} } });

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64 = (s) => b64url(new TextEncoder().encode(s));

// code: 'quota' (the free daily limit is used up), 'conflict' (someone else changed it first), 'db' (anything else)
const fail = (status, what) => Object.assign(new Error(`The database could not be ${what} (${status}).`), { code: status === 429 ? 'quota' : status === 409 || status === 412 || status === 400 ? 'conflict' : 'db' });

export function firestoreDb(account, { fetch: f = fetch, tokenUrl = 'https://oauth2.googleapis.com/token', apiBase = 'https://firestore.googleapis.com/v1', now = () => Date.now() } = {}) {
  if (!account?.project_id || !account?.client_email || !account?.private_key) throw new Error('The service account key is missing or incomplete.');
  const root = `${apiBase}/projects/${account.project_id}/databases/(default)/documents/`;
  const url = (path) => { const [p, q] = path.split('?'); return root + p.split('/').map(encodeURIComponent).join('/') + (q ? `?${q}` : ''); };
  let token = null, tokenUntil = 0, key = null;

  async function getToken() {
    if (token && now() < tokenUntil - 60000) return token;
    if (!key) {
      const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
      key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    }
    const iat = Math.floor(now() / 1000);
    const unsigned = `${text64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${text64(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: tokenUrl, iat, exp: iat + 3600 }))}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const r = await f(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64url(sig)}` });
    if (!r.ok) throw new Error(`Sign-in to the database failed (${r.status}).`);
    const j = await r.json();
    token = j.access_token; tokenUntil = now() + (Number(j.expires_in) || 3600) * 1000;
    return token;
  }
  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const r = await f(url(path), { method, headers: { authorization: `Bearer ${await getToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401 && attempt === 0) { token = null; continue; }           // the token went stale: sign in again, once
      if (r.status >= 500 && attempt < 2) continue;
      return r;
    }
  }
  return {
    async get(path) {
      const r = await call('GET', path);
      if (r.status === 404) return null;
      if (!r.ok) throw fail(r.status, 'read');
      return decodeFields((await r.json()).fields);
    },
    // the document with its version, so a later set can say "only if nobody changed it since"
    async getWithRev(path) {
      const r = await call('GET', path);
      if (r.status === 404) return { data: null, rev: null };
      if (!r.ok) throw fail(r.status, 'read');
      const j = await r.json();
      return { data: decodeFields(j.fields), rev: j.updateTime || null };
    },
    async set(path, data, { ifRev } = {}) {
      const r = await call('PATCH', path + (ifRev ? `?currentDocument.updateTime=${encodeURIComponent(ifRev)}` : ''), { fields: encodeFields(data) });
      if (!r.ok) throw fail(r.status, 'written');
    },
  };
}
