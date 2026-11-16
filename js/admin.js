/* The "Edit content" screen: every word in every part can be changed here. */
(function () {
  const BH = (window.BH = window.BH || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => BH.esc(s);
  const sel = { kind: 'part1', id: null };
  const TYPES = [
    ['title', 'Page title'], ['h', 'Section heading'], ['p', 'Paragraph'], ['li', 'Bullet'],
    ['q', 'Scripture quote'], ['callout', 'Highlight box'], ['kv', 'Label and value table'], ['table', 'Table'],
  ];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const slug = (s) => String(s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const d = () => BH.store.data;
  const touch = () => BH.store.touch();

  /* ---------- small helpers ---------- */
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach((c) => c && el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }

  /* Text field bound to an object property. Cleans punctuation when you leave the field. */
  function field(label, obj, key, o) {
    o = o || {};
    const id = 'f' + Math.random().toString(36).slice(2, 8);
    const input = h(o.multi ? 'textarea' : 'input', { id, type: o.multi ? null : 'text', rows: o.rows || 3, placeholder: o.placeholder || null });
    input.value = obj[key] == null ? '' : obj[key];
    input.addEventListener('input', () => { obj[key] = input.value; (o.onInput || (() => {}))(); touch(); updatePreview(); });
    input.addEventListener('change', () => { const c = BH.clean(input.value); if (c !== input.value) { input.value = c; obj[key] = c; } (o.onChange || (() => {}))(); touch(); updatePreview(); });
    return h('div', {}, [label ? h('label', { class: 'f', for: id, text: label }) : null, input]);
  }

  BH.confirm = function (title, body, okLabel) {
    return new Promise((res) => {
      const dlg = $('dlg');
      dlg.innerHTML = '';
      dlg.appendChild(h('h3', { text: title }));
      dlg.appendChild(h('p', { text: body, style: 'margin:0 0 18px;color:var(--ink-subtle)' }));
      const row = h('div', { class: 'actions', style: 'justify-content:flex-end' }, [
        h('button', { class: 'btn ghost', text: 'Cancel', onclick: () => { dlg.close(); res(false); } }),
        h('button', { class: 'btn danger', text: okLabel || 'Delete', onclick: () => { dlg.close(); res(true); } }),
      ]);
      dlg.appendChild(row);
      dlg.showModal();
    });
  };

  /* ---------- block editor ---------- */
  function convert(b, to) {
    const text = b.t === 'callout' ? (b.lines || []).join(' ') : (b.t === 'kv' || b.t === 'table') ? (b.rows || []).map((r) => r.join(' ')).join(' ') : (b.x || '');
    const lead = b.lead || '';
    if (to === 'callout') return { t: 'callout', lines: text ? [text] : [''] };
    if (to === 'kv') return { t: 'kv', rows: [[text, '']] };
    if (to === 'table') return { t: 'table', head: ['Column 1', 'Column 2'], rows: [[text, '']] };
    const n = { t: to, x: text };
    if ((to === 'p' || to === 'li') && lead) n.lead = lead;
    if (to === 'q') n.ref = b.ref || '';
    return n;
  }
  function blank(t) {
    if (t === 'callout') return { t, lines: ['Heading line', 'Label: detail'] };
    if (t === 'kv') return { t, rows: [['Label', '']] };
    if (t === 'table') return { t, head: ['Column 1', 'Column 2'], rows: [['', '']] };
    if (t === 'q') return { t, x: '', ref: '' };
    return { t, x: '' };
  }

  function kvEditor(rows, onStructure) {
    const wrap = h('div', { class: 'grid-rows' });
    rows.forEach((r, i) => {
      const a = h('input', { type: 'text', 'aria-label': 'Label', value: r[0] });
      const b = h('input', { type: 'text', 'aria-label': 'Value', value: r[1] });
      a.addEventListener('input', () => { r[0] = a.value; touch(); updatePreview(); });
      b.addEventListener('input', () => { r[1] = b.value; touch(); updatePreview(); });
      [a, b].forEach((x) => x.addEventListener('change', () => { x.value = BH.clean(x.value); r[x === a ? 0 : 1] = x.value; touch(); updatePreview(); }));
      wrap.appendChild(h('div', { class: 'kvrow' }, [a, b, h('button', { class: 'ib del', title: 'Remove row', 'aria-label': 'Remove row', text: '×', onclick: () => { rows.splice(i, 1); touch(); onStructure(); } })]));
    });
    wrap.appendChild(h('div', {}, [h('button', { class: 'btn ghost sm', text: 'Add row', onclick: () => { rows.push(['', '']); touch(); onStructure(); } })]));
    return wrap;
  }

  function tableEditor(b, onStructure) {
    const cols = (b.head || b.rows[0] || ['']).length;
    const wrap = h('div', { class: 'grid-rows' });
    const mkRow = (arr, label) => {
      const row = h('div', { class: 'tbrow', style: 'grid-template-columns:repeat(' + cols + ',1fr)' });
      for (let c = 0; c < cols; c++) {
        const inp = h('input', { type: 'text', value: arr[c] || '', 'aria-label': label });
        inp.addEventListener('input', () => { arr[c] = inp.value; touch(); updatePreview(); });
        inp.addEventListener('change', () => { inp.value = BH.clean(inp.value); arr[c] = inp.value; touch(); updatePreview(); });
        row.appendChild(inp);
      }
      return row;
    };
    if (b.head) wrap.appendChild(mkRow(b.head, 'Column heading'));
    b.rows.forEach((r, i) => {
      const row = mkRow(r, 'Cell');
      wrap.appendChild(row);
      row.appendChild(h('button', { class: 'ib del', text: '×', title: 'Remove row', 'aria-label': 'Remove row', onclick: () => { b.rows.splice(i, 1); touch(); onStructure(); } }));
      row.style.gridTemplateColumns = 'repeat(' + cols + ',1fr) 34px';
    });
    wrap.appendChild(h('div', {}, [h('button', { class: 'btn ghost sm', text: 'Add row', onclick: () => { b.rows.push(Array(cols).fill('')); touch(); onStructure(); } })]));
    return wrap;
  }

  function blockEditor(blocks, rerender) {
    const root = h('div');
    blocks.forEach((b, i) => {
      const typeSel = h('select', { 'aria-label': 'Block type' }, TYPES.map(([v, l]) => h('option', { value: v, text: l, selected: v === b.t })));
      typeSel.addEventListener('change', () => { blocks[i] = convert(b, typeSel.value); touch(); rerender(); });
      const top = h('div', { class: 'blk-top' }, [
        typeSel, h('span', { class: 'sp' }),
        h('button', { class: 'ib', text: '↑', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; touch(); rerender(); } }),
        h('button', { class: 'ib', text: '↓', title: 'Move down', 'aria-label': 'Move down', disabled: i === blocks.length - 1, onclick: () => { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; touch(); rerender(); } }),
        h('button', { class: 'ib', text: '+', title: 'Add another of this type below', 'aria-label': 'Add another below', onclick: () => { blocks.splice(i + 1, 0, blank(b.t)); touch(); rerender(); } }),
        h('button', { class: 'ib del', text: '×', title: 'Delete this block', 'aria-label': 'Delete this block', onclick: () => { blocks.splice(i, 1); touch(); rerender(); } }),
      ]);
      const body = h('div');
      if (b.t === 'title' || b.t === 'h') body.appendChild(field(null, b, 'x'));
      else if (b.t === 'p' || b.t === 'li') {
        body.appendChild(h('div', { class: 'row2' }, [field(null, b, 'lead', { placeholder: 'Bold lead-in (optional)' }), field(null, b, 'x', { multi: true, rows: 3 })]));
      } else if (b.t === 'q') {
        body.appendChild(field(null, b, 'x', { multi: true, rows: 2 }));
        body.appendChild(h('div', { style: 'margin-top:6px' }, [field(null, b, 'ref', { placeholder: 'Reference, for example John 3:16' })]));
      } else if (b.t === 'callout') {
        const ta = h('textarea', { rows: Math.max(3, (b.lines || []).length + 1), 'aria-label': 'Highlight box lines' });
        ta.value = (b.lines || []).join('\n');
        ta.addEventListener('input', () => { b.lines = ta.value.split('\n'); touch(); updatePreview(); });
        ta.addEventListener('change', () => { ta.value = BH.clean(ta.value); b.lines = ta.value.split('\n').filter((l) => l.trim()); touch(); updatePreview(); });
        body.appendChild(ta);
        body.appendChild(h('p', { class: 'lede', style: 'font-size:12px;margin:4px 0 0', text: 'One line per row. The first line is the bold title. Start a line with "Label:" to bold the label.' }));
      } else if (b.t === 'kv') body.appendChild(kvEditor(b.rows, rerender));
      else if (b.t === 'table') body.appendChild(tableEditor(b, rerender));
      root.appendChild(h('div', { class: 'blk' }, [top, body]));
    });
    const add = h('div', { class: 'addrow' }, [h('span', { class: 'lede', style: 'align-self:center;margin:0 6px 0 0', text: 'Add:' })].concat(
      [['h', 'Section heading'], ['p', 'Paragraph'], ['li', 'Bullet'], ['q', 'Scripture quote'], ['callout', 'Highlight box'], ['kv', 'Table']].map(([t, l]) =>
        h('button', { class: 'btn ghost sm', text: l, onclick: () => { blocks.push(blank(t)); touch(); rerender(); } }))));
    root.appendChild(add);
    return root;
  }

  /* ---------- tree ---------- */
  function node(label, kind, id, cls) {
    const cur = sel.kind === kind && sel.id === id;
    return h('button', { class: 'tnode ' + (cls || ''), 'aria-current': cur ? 'true' : null, text: label, onclick: () => { sel.kind = kind; sel.id = id; BH.admin.render(); } });
  }
  function renderTree() {
    const t = $('tree');
    t.innerHTML = '';
    t.appendChild(h('h2', { text: 'Every packet' }));
    t.appendChild(node('Part 1: Burnt Hickory', 'part1', null, 'tn1'));
    t.appendChild(node('Cover and wording', 'settings', null, 'tn1'));
    t.appendChild(h('h2', { text: 'Areas, teams, and roles' }));
    t.appendChild(h('div', { class: 'addbar' }, [
      h('button', { class: 'btn secondary sm', text: '+ Ministry area', onclick: () => addArea() }),
      h('button', { class: 'btn secondary sm', text: '+ Ministry team', onclick: () => addTeam(sel.kind === 'area' ? sel.id : sel.kind === 'team' ? d().teams[sel.id].area : null) }),
    ]));
    Object.values(d().areas).forEach((a) => {
      t.appendChild(node(a.name, 'area', a.id, 'tn1'));
      Object.values(d().teams).filter((x) => x.area === a.id).forEach((tm) => {
        t.appendChild(node(tm.name, 'team', tm.id, 'tn2'));
        Object.values(d().roles).filter((r) => r.team === tm.id).sort((x, y) => (x.order || 0) - (y.order || 0)).forEach((r) => t.appendChild(node(r.title, 'role', r.id, 'tn3')));
        t.appendChild(h('button', { class: 'tadd', style: 'margin-left:40px', text: '+ Add role', onclick: () => addRole(tm.id) }));
      });
      t.appendChild(h('button', { class: 'tadd', style: 'margin-left:24px', text: '+ Add team to ' + a.name, onclick: () => addTeam(a.id) }));
    });
    t.appendChild(h('h2', { text: 'Tools' }));
    t.appendChild(node('Backup, restore, reset', 'tools', null, 'tn1'));
  }

  /* ---------- adding things ---------- */
  /* A small form in a dialog. Resolves to the values, or null if cancelled. */
  BH.form = function (title, intro, fields, okLabel) {
    return new Promise((res) => {
      const dlg = $('dlg');
      dlg.innerHTML = '';
      const form = h('form', { class: 'dform', method: 'dialog' });
      const inputs = {};
      fields.forEach((f) => {
        const id = 'df-' + f.key;
        let el;
        if (f.options) {
          el = h('select', { id }, f.options.map(([v, l]) => h('option', { value: v, text: l, selected: v === f.value })));
        } else {
          el = h('input', { id, type: 'text', value: f.value || '', placeholder: f.placeholder || null, autocomplete: 'off' });
        }
        inputs[f.key] = el;
        form.appendChild(h('div', {}, [h('label', { class: 'f', for: id, text: f.label }), el]));
      });
      const err = h('p', { class: 'lede', style: 'color:var(--accent-ink);margin:0;min-height:1em', 'aria-live': 'polite' });
      form.appendChild(err);
      const ok = h('button', { class: 'btn primary', type: 'submit', text: okLabel || 'Add' });
      const cancel = h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: () => { dlg.close(); res(null); } });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const out = {};
        for (const f of fields) {
          out[f.key] = BH.clean(inputs[f.key].value.trim());
          if (f.required && !out[f.key]) { err.textContent = 'Please enter ' + f.label.toLowerCase() + '.'; inputs[f.key].focus(); return; }
        }
        dlg.close(); res(out);
      });
      dlg.addEventListener('cancel', () => res(null), { once: true });
      dlg.appendChild(h('h3', { text: title }));
      if (intro) dlg.appendChild(h('p', { text: intro, style: 'margin:0 0 14px;color:var(--ink-subtle);font-size:14px' }));
      dlg.appendChild(form);
      dlg.appendChild(h('div', { class: 'actions', style: 'justify-content:flex-end' }, [cancel, ok]));
      ok.addEventListener('click', () => form.requestSubmit());
      dlg.showModal();
      const first = form.querySelector('input,select'); if (first) first.focus();
    });
  };

  const uniqueId = (base, taken) => { let id = slug(base), n = 2; while (taken[id]) id = slug(base) + '-' + n++; return id; };

  async function addArea(opts) {
    const v = await BH.form('Add a ministry area',
      'A ministry area is the larger ministry that teams belong to, like Adult Ministry or Student Ministry. Its wording appears as Part 2 of every packet in that area.',
      [{ key: 'name', label: 'Ministry area name', placeholder: 'For example, Student Ministry', required: true }], 'Add area');
    if (!v) return null;
    const id = uniqueId(v.name, d().areas);
    d().areas[id] = { id, name: v.name, blocks: [
      { t: 'p', x: v.name + ' exists to ...' },
      { t: 'h', x: 'What every ' + v.name + ' volunteer can expect' },
      { t: 'li', x: 'Staff support: add the staff contact here.' },
      { t: 'h', x: 'How ' + v.name + ' fits together' },
      { t: 'p', x: 'List the teams that belong to this ministry area.' },
    ] };
    sel.kind = 'area'; sel.id = id; BH.store.save(); BH.main.show('edit'); BH.build.setSelection(id);
    BH.toast('Added ' + v.name + '. Now add its first team.');
    return id;
  }
  async function addTeam(areaId) {
    const areas = Object.values(d().areas);
    if (!areas.length) { BH.toast('Add a ministry area first'); return addArea(); }
    const v = await BH.form('Add a ministry team',
      'A ministry team is a group inside a ministry area, like Prayer Ministry or Hospitality. Its wording appears as Part 3 of every packet for its roles.',
      [
        { key: 'name', label: 'Ministry team name', placeholder: 'For example, Children\'s Check-In', required: true },
        { key: 'area', label: 'Ministry area', options: areas.map((a) => [a.id, a.name]), value: areaId || (areas[0] && areas[0].id) },
      ], 'Add team');
    if (!v) return null;
    const id = uniqueId(v.name, d().teams);
    d().teams[id] = { id, area: v.area, name: v.name, blocks: [
      { t: 'p', x: v.name + ' exists to ...' },
      { t: 'q', x: '', ref: '' },
      { t: 'h', x: 'How ' + v.name + ' works' },
      { t: 'p', lead: 'Leadership chain:', x: '' },
      { t: 'p', lead: 'Questions:', x: '' },
      { t: 'h', x: v.name + ' expectations' },
      { t: 'li', x: '' },
      { t: 'h', x: v.name + ' training' },
      { t: 'li', x: '' },
    ] };
    sel.kind = 'team'; sel.id = id; BH.store.save(); BH.main.show('edit'); BH.build.setSelection(v.area, id);
    BH.toast('Added ' + v.name + '. Now add its first role.');
    return id;
  }
  function nextOrder() { return Math.max(0, ...Object.values(d().roles).map((r) => r.order || 0)) + 1; }
  function addRole(teamId) {
    const team = d().teams[teamId];
    const area = d().areas[team.area];
    const id = slug('role') + '-' + Math.random().toString(36).slice(2, 5);
    d().roles[id] = {
      id, team: teamId, title: 'New role', level: 'Team Member', signer: 'Team Leader', order: nextOrder(),
      cover: [['Volunteer', ''], ['Role', 'New role (Team Member)'], ['Ministry team', team.name], ['Area', area.name], ['Direct leader', ''], ['Serving day', ''], ['Start date', '']],
      blocks: [
        { t: 'callout', lines: ['Your role, at a glance:', 'What: ', 'When: ', 'Reports to: ', 'Questions: '] },
        { t: 'kv', rows: [['Position Title', 'New role'], ['Ministry', team.name], ['Leadership Development Level', 'Team Member'], ['Reports To', ''], ['Screening Level', 'Level 1: General'], ['Serving Day', '']] },
        { t: 'h', x: 'Purpose' }, { t: 'p', x: '' },
        { t: 'h', x: 'Primary Responsibilities' }, { t: 'li', x: '' },
        { t: 'h', x: 'Qualifications' }, { t: 'li', x: '' },
        { t: 'h', x: 'Time Commitment' }, { t: 'p', lead: 'Schedule:', x: '' },
        { t: 'h', x: 'Training' }, { t: 'li', x: '' },
      ],
    };
    sel.kind = 'role'; sel.id = id; BH.store.save(); BH.admin.render(); BH.build.refresh();
  }
  function duplicateRole(id) {
    const r = clone(d().roles[id]);
    r.id = slug(r.title) + '-' + Math.random().toString(36).slice(2, 5);
    r.title = r.title + ' copy';
    r.order = nextOrder();
    r.cover = r.cover.map((row) => (row[0] === 'Role' ? ['Role', r.title + ' (' + r.level + ')'] : row));
    d().roles[r.id] = r;
    sel.id = r.id; BH.store.save(); BH.admin.render(); BH.build.refresh();
  }
  async function removeNode(kind, id) {
    const dd = d();
    let name = kind === 'area' ? dd.areas[id].name : kind === 'team' ? dd.teams[id].name : dd.roles[id].title;
    let extra = '';
    if (kind === 'area') extra = ' This also removes its teams and roles.';
    if (kind === 'team') extra = ' This also removes its roles.';
    const ok = await BH.confirm('Delete "' + name + '"?', 'This cannot be undone from here, but you can restore an earlier version from Backup, restore, reset.' + extra, 'Delete');
    if (!ok) return;
    BH.store.adapter.pushHistory(dd, 'Before deleting ' + name);
    if (kind === 'area') { Object.values(dd.teams).filter((t) => t.area === id).forEach((t) => { Object.values(dd.roles).filter((r) => r.team === t.id).forEach((r) => delete dd.roles[r.id]); delete dd.teams[t.id]; }); delete dd.areas[id]; }
    if (kind === 'team') { Object.values(dd.roles).filter((r) => r.team === id).forEach((r) => delete dd.roles[r.id]); delete dd.teams[id]; }
    if (kind === 'role') delete dd.roles[id];
    sel.kind = 'part1'; sel.id = null; BH.store.save(); BH.admin.render(); BH.build.refresh();
  }

  /* ---------- editor pages ---------- */
  let previewFn = null;
  function updatePreview() {
    const p = $('ed-prev');
    if (p && previewFn) { clearTimeout(updatePreview._t); updatePreview._t = setTimeout(() => { p.innerHTML = previewFn(); }, 150); }
  }

  function head(kicker, title, sub, actions) {
    return h('div', { class: 'ed-head' }, [
      h('div', {}, [h('p', { class: 'eyebrow', text: kicker }), h('h2', { style: 'font-size:24px', text: title }), sub ? h('p', { class: 'lede', text: sub }) : null]),
      h('div', { class: 'actions' }, actions || []),
    ]);
  }
  function resetBtn(kind, id) {
    const seed = BH.seed();
    const exists = kind === 'part1' || (kind === 'area' && seed.areas[id]) || (kind === 'team' && seed.teams[id]) || (kind === 'role' && seed.roles[id]);
    if (!exists) return null;
    return h('button', { class: 'btn ghost sm', text: 'Restore original wording', onclick: async () => {
      const ok = await BH.confirm('Restore the original wording?', 'Your edits to this item will be replaced with the text it started with.', 'Restore');
      if (!ok) return;
      BH.store.adapter.pushHistory(d(), 'Before restoring original');
      if (kind === 'part1') d().part1 = seed.part1;
      else if (kind === 'area') d().areas[id] = seed.areas[id];
      else if (kind === 'team') d().teams[id] = seed.teams[id];
      else d().roles[id] = seed.roles[id];
      BH.store.save(); BH.admin.render(); BH.build.refresh();
    } });
  }
  function split(editorKids, prevFn) {
    previewFn = prevFn;
    return h('div', { class: 'ed-split' }, [
      h('div', {}, editorKids),
      h('div', { class: 'ed-prev', id: 'ed-prev', 'aria-label': 'Preview', html: null }),
    ]);
  }
  function afterSplit() { const p = $('ed-prev'); if (p && previewFn) p.innerHTML = previewFn(); }

  function renderEditor() {
    const ed = $('editor');
    ed.innerHTML = '';
    previewFn = null;
    const rerender = () => BH.admin.render();
    const dd = d();

    if (sel.kind === 'part1') {
      ed.appendChild(head('Part 1', 'Burnt Hickory (every packet)', 'Edit this once and every future packet picks it up. Mission, vision, values, serving standards, and screening levels all live here.', [resetBtn('part1')]));
      ed.appendChild(split([h('p', { class: 'note', text: 'Heads up: changes here apply to every packet you build from now on.' }), blockEditor(dd.part1, rerender)], () => BH.nodePreview('part1')));
    } else if (sel.kind === 'settings') {
      const s = dd.settings;
      ed.appendChild(head('Cover and wording', 'Cover page and part labels', 'The words on the cover page, the contents list, and the acknowledgment.'));
      const f = h('div', { class: 'fields' }, [field('Church name', s, 'church'), field('Cover title', s, 'welcome'), field('Cover tagline', s, 'tagline')]);
      ed.appendChild(f);
      ed.appendChild(h('div', { style: 'margin-bottom:20px' }, [field('Note under the contents list', s, 'intro', { multi: true, rows: 3 })]));
      s.parts.forEach((p, i) => {
        ed.appendChild(h('div', { class: 'fields' }, [field('Part ' + (i + 1) + ' banner', p, 'label'), field('Part ' + (i + 1) + ' contents description', p, 'toc')]));
      });
      const ackBox = h('textarea', { rows: 4, 'aria-label': 'Acknowledgment lines' });
      ackBox.value = s.ack.join('\n');
      ackBox.addEventListener('input', () => { s.ack = ackBox.value.split('\n'); touch(); });
      ackBox.addEventListener('change', () => { ackBox.value = BH.clean(ackBox.value); s.ack = ackBox.value.split('\n').filter((l) => l.trim()); touch(); });
      ed.appendChild(h('label', { class: 'f', text: 'Acknowledgment checkboxes (one per line)' }));
      ed.appendChild(ackBox);
      const lv = h('input', { type: 'text', 'aria-label': 'Levels', value: s.levels.join(', ') });
      lv.addEventListener('change', () => { s.levels = lv.value.split(',').map((x) => x.trim()).filter(Boolean); touch(); });
      ed.appendChild(h('label', { class: 'f', style: 'margin-top:20px', text: 'Role levels (separated by commas)' }));
      ed.appendChild(lv);
    } else if (sel.kind === 'area') {
      const a = dd.areas[sel.id];
      ed.appendChild(head('Part 2', a.name, 'Shared by every team and role in this ministry area.', [h('button', { class: 'btn secondary sm', text: '+ Add team to this area', onclick: () => addTeam(a.id) }), resetBtn('area', a.id), h('button', { class: 'btn danger sm', text: 'Delete area', onclick: () => removeNode('area', a.id) })]));
      ed.appendChild(split([h('div', { class: 'fields' }, [field('Area name', a, 'name', { onChange: () => renderTree() })]), blockEditor(a.blocks, rerender)], () => BH.nodePreview('area', a.id)));
    } else if (sel.kind === 'team') {
      const tm = dd.teams[sel.id];
      const areaSel = h('select', { id: 'tm-area' }, Object.values(dd.areas).map((a) => h('option', { value: a.id, text: a.name, selected: a.id === tm.area })));
      areaSel.addEventListener('change', () => { tm.area = areaSel.value; touch(); BH.admin.render(); });
      ed.appendChild(head('Part 3', tm.name, 'Shared by every role on this team.', [h('button', { class: 'btn secondary sm', text: '+ Add role to this team', onclick: () => addRole(tm.id) }), resetBtn('team', tm.id), h('button', { class: 'btn danger sm', text: 'Delete team', onclick: () => removeNode('team', tm.id) })]));
      ed.appendChild(split([h('div', { class: 'fields' }, [field('Team name', tm, 'name', { onChange: () => renderTree() }), h('div', {}, [h('label', { class: 'f', for: 'tm-area', text: 'Ministry area' }), areaSel])]), blockEditor(tm.blocks, rerender)], () => BH.nodePreview('team', tm.id)));
    } else if (sel.kind === 'role') {
      const r = dd.roles[sel.id];
      const lvl = h('select', { id: 'r-lvl' }, dd.settings.levels.map((l) => h('option', { value: l, text: l, selected: l === r.level })));
      const tsel = h('select', { id: 'r-team' }, Object.values(dd.teams).map((t) => h('option', { value: t.id, text: dd.areas[t.area].name + ': ' + t.name, selected: t.id === r.team })));
      const syncRole = () => { r.cover = r.cover.map((row) => (row[0] === 'Role' ? ['Role', r.title + ' (' + r.level + ')'] : row)); };
      lvl.addEventListener('change', () => { r.level = lvl.value; syncRole(); touch(); BH.admin.render(); });
      tsel.addEventListener('change', () => { r.team = tsel.value; touch(); BH.admin.render(); });
      ed.appendChild(head('Part 4', r.title, 'Responsibilities, qualifications, time commitment, and training for this one role.', [
        resetBtn('role', r.id),
        h('button', { class: 'btn secondary sm', text: 'Duplicate role', onclick: () => duplicateRole(r.id) }),
        h('button', { class: 'btn secondary sm', text: 'Preview in builder', onclick: () => { BH.main.show('build'); BH.build.select(r.id); } }),
        h('button', { class: 'btn danger sm', text: 'Delete role', onclick: () => removeNode('role', r.id) }),
      ]));
      const covEd = h('div', {}, [h('label', { class: 'f', text: 'Cover page details (the Volunteer and Start date rows are filled in when you build a packet)' }), kvEditor(r.cover, rerender)]);
      ed.appendChild(split([
        h('div', { class: 'fields' }, [
          field('Role title', r, 'title', { onChange: () => { syncRole(); renderTree(); } }),
          h('div', {}, [h('label', { class: 'f', for: 'r-lvl', text: 'Leadership level' }), lvl]),
          h('div', {}, [h('label', { class: 'f', for: 'r-team', text: 'Team' }), tsel]),
          field('Who signs off (title)', r, 'signer'),
        ]),
        covEd,
        h('h3', { style: 'font-size:15px;margin:22px 0 10px', text: 'Role details' }),
        h('p', { class: 'note', text: 'Qualifications, screening level, and time commitment are set here, so each role can have its own requirements. For example, one team can require regular attendance and another can say membership is not required.' }),
        blockEditor(r.blocks, rerender),
      ], () => BH.nodePreview('role', r.id)));
    } else if (sel.kind === 'tools') {
      ed.appendChild(head('Tools', 'Backup, restore, reset'));
      const hist = BH.store.adapter.history();
      ed.appendChild(h('div', { class: 'note', text: BH.store.adapter.label + '. When we connect shared storage, edits will be saved for everyone who uses the builder.' }));
      ed.appendChild(h('h3', { style: 'font-size:16px;margin:0 0 8px', text: 'Backup file' }));
      ed.appendChild(h('div', { class: 'actions', style: 'margin-bottom:24px' }, [
        h('button', { class: 'btn secondary', text: 'Download backup', onclick: () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([BH.store.exportJson()], { type: 'application/json' }));
          a.download = 'bhbc-packet-content-backup.json'; document.body.appendChild(a); a.click(); a.remove();
        } }),
        h('label', { class: 'btn ghost', for: 'imp', text: 'Load a backup' }),
        h('input', { type: 'file', id: 'imp', accept: 'application/json', class: 'sr-only', onchange: (e) => {
          const f = e.target.files[0]; if (!f) return;
          f.text().then((txt) => { try { BH.store.importJson(txt); BH.toast('Backup loaded'); BH.admin.render(); BH.build.refresh(); } catch (err) { BH.toast(err.message); } });
        } }),
      ]));
      ed.appendChild(h('h3', { style: 'font-size:16px;margin:0 0 8px', text: 'Earlier versions' }));
      const ul = h('ul', { class: 'hist' });
      if (!hist.length) ul.appendChild(h('li', { class: 'lede', text: 'No earlier versions yet. One is saved each time you start editing.' }));
      hist.forEach((v, i) => ul.appendChild(h('li', { class: 'actions', style: 'justify-content:space-between;align-items:center' }, [
        h('span', { text: new Date(v.at).toLocaleString() + ' (' + v.note + ')' }),
        h('button', { class: 'btn ghost sm', text: 'Restore', onclick: () => { BH.store.restore(i); BH.toast('Version restored'); BH.admin.render(); BH.build.refresh(); } }),
      ])));
      ed.appendChild(ul);
      ed.appendChild(h('h3', { style: 'font-size:16px;margin:24px 0 8px', text: 'Start over' }));
      ed.appendChild(h('button', { class: 'btn danger', text: 'Reset everything to the original packets', onclick: async () => {
        const ok = await BH.confirm('Reset everything?', 'All of your edits will be replaced with the original packet text. A copy of your current version is kept under Earlier versions.', 'Reset');
        if (ok) { BH.store.resetAll(); BH.toast('Reset to original'); sel.kind = 'part1'; BH.admin.render(); BH.build.refresh(); }
      } }));
    }
    afterSplit();
  }

  BH.admin = {
    addArea, addTeam,
    open(kind, id) { sel.kind = kind; sel.id = id; this.render(); },
    render() {
      const y = window.scrollY;
      renderTree();
      renderEditor();
      window.scrollTo(0, y);
    },
  };
})();
