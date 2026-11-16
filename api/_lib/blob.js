/* Storage backed by Vercel Blob (private store). On Vercel it signs in automatically
   using BLOB_STORE_ID, so there is no secret token to manage. */
import { get, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';

const PATHS = { content: 'rolebuilder/content.json', history: 'rolebuilder/history.json' };

export const blobStore = {
  async read(name) {
    let r;
    try { r = await get(PATHS[name], { access: 'private', useCache: false }); }
    catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
    if (!r || r.statusCode !== 200) return null;
    const text = await new Response(r.stream).text();
    return { text, etag: r.blob.etag };
  },
  async write(name, text, ifMatch) {
    try {
      const opts = { access: 'private', allowOverwrite: true, contentType: 'application/json', addRandomSuffix: false };
      if (ifMatch) opts.ifMatch = ifMatch;
      const r = await put(PATHS[name], text, opts);
      return { etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) { const err = new Error('precondition'); err.code = 'PRECONDITION'; throw err; }
      throw e;
    }
  },
};
