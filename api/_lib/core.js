/* Shared logic for the content API. It does not know where the data lives:
   the storage object (Vercel Blob in production, memory in tests) is passed in. */
import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_BYTES = 3 * 1024 * 1024;
const HISTORY_KEEP = 8;
const SNAPSHOT_EVERY_MS = 15 * 60 * 1000;

const sha = (s) => createHash('sha256').update(String(s)).digest();
export function passcodeOk(given, expected) {
  if (!expected || !given) return false;
  return timingSafeEqual(sha(given), sha(expected));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extra || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BYTES + 1024) throw new Error('too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function valid(d) {
  return d && typeof d === 'object' && Array.isArray(d.part1) && d.areas && d.teams && d.roles && d.settings;
}

export function makeHandlers(store, getEnv) {
  const pass = () => getEnv('EDIT_PASSCODE');
  const authed = (req) => passcodeOk(req.headers['x-edit-passcode'], pass());

  async function unlock(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
    if (!pass()) return send(res, 503, { error: 'The passcode has not been set up on the server yet.' });
    if (!authed(req)) { await sleep(500); return send(res, 401, { error: 'That passcode is not right.' }); }
    return send(res, 200, { ok: true });
  }

  async function content(req, res) {
    try {
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://x');
        if (url.searchParams.get('history')) {
          if (!authed(req)) return send(res, 401, { error: 'Passcode needed.' });
          const h = await store.read('history');
          return send(res, 200, { history: h ? JSON.parse(h.text) : [] });
        }
        const cur = await store.read('content');
        if (!cur) return send(res, 200, { empty: true, etag: null });
        const env = JSON.parse(cur.text);
        return send(res, 200, { data: env.data, savedAt: env.savedAt, etag: cur.etag });
      }
      if (req.method !== 'PUT') return send(res, 405, { error: 'Use GET or PUT.' });
      if (!pass()) return send(res, 503, { error: 'The passcode has not been set up on the server yet.' });
      if (!authed(req)) { await sleep(500); return send(res, 401, { error: 'Passcode needed.' }); }
      const body = await readBody(req);
      if (!valid(body.data)) return send(res, 400, { error: 'This does not look like packet content.' });
      const text = JSON.stringify({ savedAt: new Date().toISOString(), data: body.data });
      if (Buffer.byteLength(text) > MAX_BYTES) return send(res, 413, { error: 'The content is too large to save.' });

      const prev = await store.read('content');
      const prevEtag = prev ? prev.etag : null;
      if ((body.ifMatch || null) !== prevEtag) {
        return send(res, 409, { error: 'Someone else saved changes first.', etag: prevEtag });
      }
      let out;
      try { out = await store.write('content', text, prevEtag); }
      catch (e) { if (e && e.code === 'PRECONDITION') return send(res, 409, { error: 'Someone else saved changes first.' }); throw e; }

      // Earlier versions (best effort, never blocks the save).
      try {
        if (prev) {
          const old = JSON.parse(prev.text);
          const hRaw = await store.read('history');
          const hist = hRaw ? JSON.parse(hRaw.text) : [];
          const newest = hist[0] ? Date.parse(hist[0].at) : 0;
          const wantsSnap = body.snapshot || Date.now() - newest > SNAPSHOT_EVERY_MS;
          if (wantsSnap && old.data) {
            hist.unshift({ at: old.savedAt || new Date().toISOString(), note: body.snapshot || 'Automatic copy', data: old.data });
            await store.write('history', JSON.stringify(hist.slice(0, HISTORY_KEEP)), hRaw ? hRaw.etag : null);
          }
        }
      } catch (e) { /* history is optional */ }
      return send(res, 200, { ok: true, etag: out.etag });
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: 'The server could not complete that.' });
    }
  }
  return { unlock, content };
}
