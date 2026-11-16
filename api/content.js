import { makeHandlers } from './_lib/core.js';
import { blobStore } from './_lib/blob.js';

const h = makeHandlers(blobStore, (k) => process.env[k]);
export default function handler(req, res) { return h.content(req, res); }
