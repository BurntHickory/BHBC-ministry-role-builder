/* Upload a Word or PDF file and turn it into a packet.
   This reads the file's headings, bullets, and tables in the browser (nothing is uploaded anywhere),
   guesses the area, team, and role, and lets you confirm before anything is added. */
(function () {
  const BH = (window.BH = window.BH || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => BH.esc(s);

  /* ---------- text helpers ---------- */
  const SMALL = new Set(['a', 'an', 'and', 'of', 'the', 'to', 'our', 'for', 'in', 'on', 'at', 'or', 'by', 'with', 'your']);
  const KEEP = new Set(['PLACE', 'BHBC', 'AED', 'AEDS', 'FAQ', 'ID', 'PRAY']);
  function tcase(t) {
    return t.split(' ').map((w, i) => {
      const core = w.replace(/[^A-Za-z]/g, '');
      if (KEEP.has(core)) return w;
      if (i > 0 && SMALL.has(core.toLowerCase())) return w.toLowerCase();
      return w.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase());
    }).join(' ').replace(/Caregroup/g, 'CareGroup').replace(/Lifegroup/g, 'LifeGroup');
  }
  const isCaps = (s) => { const l = s.replace(/[^A-Za-z]/g, ''); return l.length > 1 && l === l.toUpperCase(); };
  const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const norm = (s) => squash(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const stem = (s) => norm(s).replace(/(ministry|ministries|team|teams)$/, '').replace(/s$/, '');

  const LEVELS = [['team member', 'Team Member'], ['leadership team', 'Leadership Team'], ['leader', 'Leader'], ['coach', 'Coach']];
  function findLevel(text) {
    const t = String(text || '').toLowerCase();
    for (const [k, v] of LEVELS) if (new RegExp('\\b' + k + '\\b').test(t)) return v;
    return '';
  }

  function leadSplit(text) {
    const m = /^([A-Z][^:.]{1,40}[:.])\s+(\S.*)$/.exec(text);
    return m && m[1].length <= 42 && /:$/.test(m[1]) ? { lead: m[1], x: m[2] } : null;
  }

  /* ---------- Word ---------- */
  async function parseDocx(buf) {
    if (!window.mammoth) throw new Error('The Word reader did not load.');
    const r = await window.mammoth.convertToHtml({ arrayBuffer: buf }, {
      styleMap: ["p[style-name='List Paragraph'] => ul > li:fresh", "p[style-name='Title'] => h1:fresh"],
    });
    const doc = new DOMParser().parseFromString(r.value, 'text/html');
    const out = [];
    const boldOnly = (el) => {
      const txt = squash(el.textContent);
      if (!txt) return false;
      let b = '';
      el.querySelectorAll('strong,b').forEach((s) => { b += s.textContent; });
      return squash(b).length >= txt.length - 1;
    };
    const para = (el, asLi) => {
      const text = squash(el.textContent);
      if (!text) return;
      if (!asLi && boldOnly(el) && text.length < 90 && !/[.!?]$/.test(text)) {
        out.push(isCaps(text) ? { t: 'h', x: tcase(text) } : { t: 'title', x: text });
        return;
      }
      if (!asLi && /^[“"]/.test(text)) {
        const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(text);
        if (m) { out.push({ t: 'q', x: m[1].trim(), ref: m[2].trim() }); return; }
      }
      const first = el.firstElementChild;
      let lead = '';
      if (first && /^(STRONG|B)$/.test(first.tagName) && squash(first.textContent).length < text.length - 2) {
        lead = squash(first.textContent);
      }
      const b = { t: asLi ? 'li' : 'p', x: lead ? squash(text.slice(text.indexOf(lead) + lead.length)) : text };
      if (lead) b.lead = lead;
      out.push(b);
    };
    const table = (el) => {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => squash(c.textContent).replace(/\s*\n\s*/g, ' ')));
      if (!rows.length) return;
      const cols = Math.max(...rows.map((r) => r.length));
      if (cols === 1) {
        out.push({ t: 'callout', lines: [...el.querySelectorAll('td p, td')].length ? [...el.querySelectorAll('td')].flatMap((td) => [...td.querySelectorAll('p')].map((p) => squash(p.textContent)).filter(Boolean)) : rows.map((r) => r[0]) });
      } else if (cols === 2) out.push({ t: 'kv', rows: rows.map((r) => [r[0] || '', r[1] || '']) });
      else {
        const head = el.querySelector('thead') || boldOnly(el.querySelector('tr td') || el) ? rows[0] : null;
        out.push({ t: 'table', head: head, rows: head ? rows.slice(1) : rows });
      }
    };
    const walk = (node) => {
      [...node.children].forEach((el) => {
        const tag = el.tagName;
        if (/^H[1-6]$/.test(tag)) { const x = squash(el.textContent); if (x) out.push(tag === 'H1' ? { t: 'title', x } : { t: 'h', x: isCaps(x) ? tcase(x) : x }); }
        else if (tag === 'P') para(el, false);
        else if (tag === 'UL' || tag === 'OL') [...el.children].forEach((li) => para(li, true));
        else if (tag === 'TABLE') table(el);
        else walk(el);
      });
    };
    walk(doc.body);
    return out;
  }

  /* ---------- PDF ---------- */
  async function parsePdf(buf) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('The PDF reader did not load.');
    lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], h: Math.hypot(i.transform[2], i.transform[3]) || 10, w: i.width }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      items.forEach((it) => {
        if (cur && Math.abs(it.y - cur.y) <= 2.5) {
          const gap = it.x - cur.end;
          cur.text += (gap > it.h * 0.18 ? ' ' : '') + it.s; cur.end = it.x + it.w; cur.h = Math.max(cur.h, it.h);
        } else {
          if (cur) lines.push(cur);
          cur = { page: p, y: it.y, x: it.x, end: it.x + it.w, h: it.h, text: it.s };
        }
      });
      if (cur) lines.push(cur);
    }
    // drop running headers and footers (same text on many pages)
    const counts = {};
    lines.forEach((l) => { const k = l.text.replace(/\d+/g, '#').trim(); counts[k] = (counts[k] || new Set()).add(l.page); });
    const minPages = Math.max(3, Math.ceil(pdf.numPages / 2));
    const keep = lines.filter((l) => { const k = l.text.replace(/\d+/g, '#').trim(); return !(counts[k].size >= minPages && l.text.length < 90); });
    if (!keep.length) throw new Error('No text was found. A scanned PDF needs its text recognized first.');
    const sizes = keep.map((l) => l.h).sort((a, b) => a - b);
    const body = sizes[Math.floor(sizes.length / 2)] || 10;
    const out = [];
    let prev = null;
    const bullet = /^[•▪●·‣◦⁃]\s*/;
    keep.forEach((l) => {
      let text = squash(l.text);
      if (!text) return;
      const gap = prev && prev.page === l.page ? prev.y - l.y : 999;
      const cont = prev && gap < body * 1.7;
      let b = null;
      if (bullet.test(text)) { b = { t: 'li', x: text.replace(bullet, '') }; }
      else if (l.h >= body * 1.45 && text.length < 80) b = { t: 'title', x: text };
      else if (text.length < 70 && (isCaps(text) || l.h >= body * 1.15) && !/[.,;]$/.test(text)) b = { t: 'h', x: isCaps(text) ? tcase(text) : text };
      const last = out[out.length - 1];
      if (!b && cont && last && (last.t === 'p' || last.t === 'li') && !leadSplit(text)) { last.x = squash(last.x + ' ' + text); }
      else if (!b) {
        const ls = leadSplit(text);
        b = ls ? { t: 'p', lead: ls.lead, x: ls.x } : { t: 'p', x: text };
        if (/^[“"]/.test(text)) { const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(text); if (m) b = { t: 'q', x: m[1], ref: m[2] }; }
        out.push(b);
      } else out.push(b);
      prev = l;
    });
    return out;
  }

  /* ---------- work out what the file contains ---------- */
  function analyze(blocks, fileName) {
    const text = (b) => b.x || (b.lines || []).join(' ');
    const idx = {};
    blocks.forEach((b, i) => {
      if (b.t === 'h' || b.t === 'title') {
        const m = /^part\s*([1-4])\b/i.exec(b.x);
        if (m && idx[m[1]] == null) idx[m[1]] = i;
      }
    });
    const res = { fileName, blocks, mode: 'role', cover: null, part1: null, area: null, team: null, role: { title: '', level: '', blocks: [] }, signer: '', hints: {} };
    const coverKv = blocks.find((b) => b.t === 'kv' && b.rows.some((r) => /^role$/i.test(r[0])));
    if (coverKv) res.cover = coverKv.rows;

    if (idx[4] != null && idx[3] != null && idx[2] != null) {
      res.mode = 'packet';
      const seg = (n, next) => blocks.slice(idx[n] + 1, next);
      const take = (arr) => { const nameIdx = arr.findIndex((b) => b.t === 'title' || b.t === 'h'); if (nameIdx < 0) return { name: '', blocks: arr }; return { name: arr[nameIdx].x, blocks: arr.slice(nameIdx + 1) }; };
      if (idx[1] != null) res.part1 = take(seg(1, idx[2]));
      res.area = take(seg(2, idx[3]));
      res.team = take(seg(3, idx[4]));
      let p4 = blocks.slice(idx[4] + 1);
      const ackAt = p4.findIndex((b) => (b.t === 'h' || b.t === 'title') && /^acknowledg/i.test(b.x));
      const ack = ackAt >= 0 ? p4.slice(ackAt + 1) : [];
      if (ackAt >= 0) p4 = p4.slice(0, ackAt);
      const t = take(p4);
      res.role.title = t.name;
      let rest = t.blocks;
      if (rest[0] && (rest[0].t === 'title' || rest[0].t === 'h' || rest[0].t === 'p') && findLevel(rest[0].x) && rest[0].x.length < 30) { res.role.level = findLevel(rest[0].x); rest = rest.slice(1); }
      res.role.blocks = rest;
      const sig = ack.flatMap((b) => (b.t === 'table' || b.t === 'kv' ? b.rows.flat() : [b.x || ''])).find((c) => /signature$/i.test(c) && !/^volunteer/i.test(c));
      if (sig) res.signer = squash(sig.replace(/signature$/i, ''));
      if (coverKv) {
        const get = (k) => (coverKv.rows.find((r) => r[0].toLowerCase() === k) || [])[1] || '';
        const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(get('role'));
        if (m) { if (!res.role.title) res.role.title = m[1]; if (!res.role.level) res.role.level = findLevel(m[2]); }
      }
    } else {
      // a single role description
      let rest = blocks.slice();
      const kv = rest.find((b) => b.t === 'kv');
      const kvGet = (re) => { if (!kv) return ''; const r = kv.rows.find((x) => re.test(x[0])); return r ? r[1] : ''; };
      let title = kvGet(/^position title$/i) || kvGet(/^role$/i);
      const tIdx = rest.findIndex((b) => b.t === 'title');
      if (tIdx >= 0 && !title) { title = rest[tIdx].x; rest.splice(tIdx, 1); }
      else if (tIdx >= 0 && norm(rest[tIdx].x) === norm(title)) rest.splice(tIdx, 1);
      if (!title) { const hi = rest.findIndex((b) => b.t === 'h'); if (hi >= 0) { title = rest[hi].x; rest.splice(hi, 1); } }
      const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(title);
      if (m && findLevel(m[2])) { title = m[1]; res.role.level = findLevel(m[2]); }
      res.role.title = squash(title) || squash(fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\bpacket\b/i, ''));
      res.role.level = res.role.level || findLevel(kvGet(/level/i)) || findLevel(blocks.slice(0, 8).map(text).join(' ')) || findLevel(res.role.title) || 'Team Member';
      res.hints.team = kvGet(/^(ministry team|team|ministry)$/i);
      res.hints.area = kvGet(/^area$/i);
      res.role.blocks = rest.map((b) => (b.t === 'title' ? { t: 'h', x: tcase(b.x) } : b));
    }
    res.role.level = res.role.level || 'Team Member';
    return res;
  }

  /* ---------- match against what already exists ---------- */
  function bestMatch(name, items, getName) {
    const n = stem(name);
    if (!n) return null;
    let found = items.find((i) => norm(getName(i)) === norm(name));
    if (found) return found;
    found = items.find((i) => stem(getName(i)) === n);
    if (found) return found;
    return items.find((i) => { const s = stem(getName(i)); return s && (s.includes(n) || n.includes(s)); }) || null;
  }

  /* ---------- the dialog ---------- */
  const h = (tag, attrs, kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v); });
    (kids || []).forEach((c) => c && el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  };
  const countBy = (blocks, t) => blocks.filter((b) => b.t === t).length;

  BH.importer = {
    open() {
      const dlg = $('dlg');
      dlg.innerHTML = '';
      const msg = h('p', { class: 'lede', 'aria-live': 'polite', style: 'min-height:1.4em;margin:10px 0 0' });
      const file = h('input', { type: 'file', id: 'imp-file', accept: '.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', class: 'sr-only' });
      file.addEventListener('change', () => { if (file.files[0]) this.read(file.files[0], msg); });
      dlg.appendChild(h('h3', { text: 'Build a packet from a document' }));
      dlg.appendChild(h('p', { style: 'margin:0 0 12px;color:var(--ink-subtle);font-size:14px', text: 'Upload a Word (.docx) or PDF file. It can be a full four-part packet or a single role description. The file is read right here in your browser. You will confirm where it goes before anything is added.' }));
      dlg.appendChild(file);
      const drop = h('label', { class: 'btn secondary', for: 'imp-file', style: 'width:100%;min-height:96px;border-style:dashed', text: 'Choose a Word or PDF file' });
      drop.addEventListener('dragover', (e) => e.preventDefault());
      drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) this.read(f, msg); });
      dlg.appendChild(drop);
      dlg.appendChild(msg);
      dlg.appendChild(h('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:14px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: () => dlg.close() })]));
      dlg.showModal();
    },

    async read(f, msg) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext === 'doc') { msg.textContent = 'Older .doc files are not supported. In Word, choose Save As and pick .docx, then try again.'; return; }
      if (ext !== 'docx' && ext !== 'pdf') { msg.textContent = 'Please choose a .docx or .pdf file.'; return; }
      msg.textContent = 'Reading ' + f.name + '...';
      try {
        const buf = await f.arrayBuffer();
        const blocks = BH.deepClean(ext === 'pdf' ? await parsePdf(buf) : await parseDocx(buf));
        if (!blocks.length) throw new Error('No text was found in this file.');
        const a = analyze(blocks, f.name);
        a.kind = ext;
        this.review(a);
      } catch (e) {
        console.error(e);
        msg.textContent = 'Could not read this file. ' + (e && e.message ? e.message : '');
      }
    },

    review(a) {
      const d = BH.store.data;
      const dlg = $('dlg');
      dlg.innerHTML = '';
      const areas = Object.values(d.areas);
      const areaName = (a.area && a.area.name) || a.hints.area || '';
      const teamName = (a.team && a.team.name) || a.hints.team || '';
      let areaM = bestMatch(areaName, areas, (x) => x.name);
      let teamPool = (aid) => Object.values(d.teams).filter((t) => t.area === aid);
      let teamM = bestMatch(teamName, areaM ? teamPool(areaM.id) : Object.values(d.teams), (x) => x.name);
      if (!areaM && teamM) areaM = d.areas[teamM.area];

      const state = { area: areaM ? areaM.id : (areaName ? '__new' : (areas[0] && areas[0].id)), team: teamM ? teamM.id : (teamName ? '__new' : '') };
      const mk = (label, el, id) => h('div', {}, [h('label', { class: 'f', for: id, text: label }), el]);

      const areaSel = h('select', { id: 'rv-area' });
      const teamSel = h('select', { id: 'rv-team' });
      const areaNew = h('input', { type: 'text', id: 'rv-area-new', value: areaName, placeholder: 'New ministry area name' });
      const teamNew = h('input', { type: 'text', id: 'rv-team-new', value: teamName, placeholder: 'New ministry team name' });
      const title = h('input', { type: 'text', id: 'rv-title', value: a.role.title });
      const level = h('select', { id: 'rv-level' }, d.settings.levels.map((l) => h('option', { value: l, text: l, selected: l === a.role.level })));
      if (!d.settings.levels.includes(a.role.level)) level.insertBefore(h('option', { value: a.role.level, text: a.role.level, selected: true }), level.firstChild);

      const fillAreas = () => {
        areaSel.innerHTML = '';
        areas.forEach((x) => areaSel.appendChild(h('option', { value: x.id, text: x.name, selected: x.id === state.area })));
        areaSel.appendChild(h('option', { value: '__new', text: 'Create a new ministry area', selected: state.area === '__new' }));
        areaNew.parentNode && (areaNew.parentNode.hidden = state.area !== '__new');
      };
      const fillTeams = () => {
        teamSel.innerHTML = '';
        if (state.area !== '__new') teamPool(state.area).forEach((x) => teamSel.appendChild(h('option', { value: x.id, text: x.name, selected: x.id === state.team })));
        teamSel.appendChild(h('option', { value: '__new', text: 'Create a new ministry team', selected: state.team === '__new' || state.area === '__new' }));
        if (state.area === '__new') state.team = '__new';
        if (state.team !== '__new' && !teamSel.value) state.team = teamSel.value;
        teamNew.parentNode && (teamNew.parentNode.hidden = state.team !== '__new');
      };

      const optBoxes = [];
      const box = (key, label, checked) => {
        const id = 'rv-' + key;
        const cb = h('input', { type: 'checkbox', id, checked: checked ? true : null, style: 'width:20px;height:20px;flex:0 0 20px;margin-top:3px' });
        optBoxes.push([key, cb]);
        return h('label', { for: id, style: 'display:flex;gap:10px;align-items:flex-start;font-size:14px;margin:0 0 8px' }, [cb, h('span', { text: label })]);
      };

      const found = a.mode === 'packet' ? 'a full four-part packet' : 'a single role description';
      const nB = a.role.blocks.length;
      const summary = 'Found ' + found + ' with ' + countBy(a.role.blocks, 'h') + ' role sections and ' + countBy(a.role.blocks, 'li') + ' bullets.';

      dlg.appendChild(h('h3', { text: 'Where should this go?' }));
      dlg.appendChild(h('p', { style: 'margin:0 0 4px;font-size:14px;color:var(--ink-subtle)', text: a.fileName }));
      dlg.appendChild(h('p', { style: 'margin:0 0 14px;font-size:14px', text: summary }));
      if (a.kind === 'pdf') dlg.appendChild(h('p', { class: 'note', text: 'PDF text can lose tables and formatting, so check each section after the packet is built.' }));
      const form = h('div', { class: 'dform' });
      form.appendChild(mk('Ministry area', areaSel, 'rv-area'));
      form.appendChild(mk('New ministry area name', areaNew, 'rv-area-new'));
      form.appendChild(mk('Ministry team', teamSel, 'rv-team'));
      form.appendChild(mk('New ministry team name', teamNew, 'rv-team-new'));
      form.appendChild(mk('Role title', title, 'rv-title'));
      form.appendChild(mk('Leadership level', level, 'rv-level'));
      dlg.appendChild(form);

      if (a.mode === 'packet') {
        const grp = h('div', { style: 'margin:0 0 14px' });
        grp.appendChild(h('p', { class: 'eyebrow', text: 'Also use wording from this file for' }));
        grp.appendChild(box('p2', 'Part 2, the ministry area (replaces the current wording if the area already exists)', !areaM));
        grp.appendChild(box('p3', 'Part 3, the ministry team (replaces the current wording if the team already exists)', !teamM));
        if (a.part1 && a.part1.blocks.length) grp.appendChild(box('p1', 'Part 1, Burnt Hickory (this changes every packet, so leave it unchecked unless you mean it)', false));
        dlg.appendChild(grp);
      }

      const err = h('p', { class: 'lede', style: 'color:var(--accent-ink);margin:0 0 10px;min-height:1em', 'aria-live': 'polite' });
      dlg.appendChild(err);
      dlg.appendChild(h('div', { class: 'actions', style: 'justify-content:flex-end' }, [
        h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: () => dlg.close() }),
        h('button', { class: 'btn primary', type: 'button', text: 'Build the packet', onclick: () => {
          const checks = Object.fromEntries(optBoxes.map(([k, cb]) => [k, cb.checked]));
          const res = this.apply(a, {
            area: state.area, areaNew: BH.clean(areaNew.value.trim()), team: state.team, teamNew: BH.clean(teamNew.value.trim()),
            title: BH.clean(title.value.trim()), level: level.value, checks,
          });
          if (res.error) { err.textContent = res.error; return; }
          dlg.close();
        } }),
      ]));
      areaSel.addEventListener('change', () => { state.area = areaSel.value; state.team = state.area === '__new' ? '__new' : (teamPool(state.area)[0] ? teamPool(state.area)[0].id : '__new'); fillTeams(); fillAreas(); });
      teamSel.addEventListener('change', () => { state.team = teamSel.value; fillTeams(); });
      fillAreas(); fillTeams();
      if (!dlg.open) dlg.showModal();
    },

    apply(a, o) {
      const d = BH.store.data;
      const slug = (s) => String(s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
      const uniq = (base, taken) => { let id = slug(base), n = 2; while (taken[id]) id = slug(base) + '-' + n++; return id; };
      if (!o.title) return { error: 'Please enter a role title.' };
      if (o.area === '__new' && !o.areaNew) return { error: 'Please enter a name for the new ministry area.' };
      if (o.team === '__new' && !o.teamNew) return { error: 'Please enter a name for the new ministry team.' };
      BH.store.adapter.pushHistory(d, 'Before importing ' + a.fileName);

      let areaId = o.area;
      if (areaId === '__new') {
        areaId = uniq(o.areaNew, d.areas);
        d.areas[areaId] = { id: areaId, name: o.areaNew, blocks: a.area && a.area.blocks.length ? a.area.blocks : [{ t: 'p', x: o.areaNew + ' exists to ...' }, { t: 'h', x: 'What every volunteer here can expect' }, { t: 'li', x: '' }] };
      } else if (o.checks.p2 && a.area && a.area.blocks.length) d.areas[areaId].blocks = a.area.blocks;

      let teamId = o.team;
      if (teamId === '__new') {
        teamId = uniq(o.teamNew, d.teams);
        d.teams[teamId] = { id: teamId, area: areaId, name: o.teamNew, blocks: a.team && a.team.blocks.length ? a.team.blocks : [{ t: 'p', x: o.teamNew + ' exists to ...' }, { t: 'h', x: 'How ' + o.teamNew + ' works' }, { t: 'p', x: '' }, { t: 'h', x: 'Expectations' }, { t: 'li', x: '' }, { t: 'h', x: 'Training' }, { t: 'li', x: '' }] };
      } else if (o.checks.p3 && a.team && a.team.blocks.length) d.teams[teamId].blocks = a.team.blocks;

      if (o.checks.p1 && a.part1 && a.part1.blocks.length) d.part1 = [{ t: 'title', x: a.part1.name || 'Serving at Burnt Hickory' }].concat(a.part1.blocks);

      const area = d.areas[areaId], team = d.teams[teamId];
      const existing = Object.values(d.roles).some((r) => r.team === teamId && norm(r.title) === norm(o.title));
      const title = existing ? o.title + ' (imported)' : o.title;
      const id = uniq(title, d.roles);
      const order = Math.max(0, ...Object.values(d.roles).map((r) => r.order || 0)) + 1;
      let cover = (a.cover && a.cover.length) ? a.cover.map((r) => r.slice()) : null;
      if (!cover) cover = [['Volunteer', ''], ['Role', ''], ['Ministry team', team.name], ['Area', area.name], ['Direct leader', ''], ['Serving day', ''], ['Start date', '']];
      cover = cover.map((r) => (/^role$/i.test(r[0]) ? ['Role', title + ' (' + o.level + ')'] : r));
      d.roles[id] = { id, team: teamId, title, level: o.level, signer: a.signer || 'Team Leader', order, cover, blocks: a.role.blocks, importNote: 'Built from ' + a.fileName + '. Read each section and edit what you need.' };
      BH.store.save();
      BH.main.show('edit');
      BH.admin.open('role', id);
      BH.build.select(id);
      BH.toast('Built "' + title + '". Review it and edit what you need.');
      return { id };
    },
  };

  BH._import = { parseDocx, parsePdf, analyze };
})();
