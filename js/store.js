/* Content store.
   Today this saves to this browser only (demo mode). The adapter below is the one place
   that changes when we connect Vercel storage, so the rest of the app stays the same. */
(function () {
  const BH = (window.BH = window.BH || {});
  const KEY = 'bhbc.rolebuilder.v2';
  const HKEY = KEY + '.history';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* Tidy text everywhere: no long dashes, no stacked punctuation. */
  BH.clean = function (s) {
    if (typeof s !== 'string') return s;
    return s
      .replace(/\s*—\s*/g, ', ')
      .replace(/\s*–\s*/g, ' to ')
      .replace(/([!?,;:])\1+/g, '$1')
      .replace(/ /g, ' ');
  };
  BH.deepClean = function (o) {
    if (typeof o === 'string') return BH.clean(o);
    if (Array.isArray(o)) return o.map(BH.deepClean);
    if (o && typeof o === 'object') {
      const r = {};
      for (const k in o) r[k] = BH.deepClean(o[k]);
      return r;
    }
    return o;
  };

  /* Where the content lives. "demo" = this browser only (also used when opened from a file).
     "shared" = saved through /api/content so everyone sees the same edits. */
  const shared = { on: false, etag: null, timer: null, saving: false, again: false, dirty: false, conflict: false, snapNote: null, hist: [], unlocked: false };
  const PASS = 'bhbc.passcode';
  const getPass = () => { try { return sessionStorage.getItem(PASS) || ''; } catch (e) { return ''; } };
  const setPass = (v) => { try { v ? sessionStorage.setItem(PASS, v) : sessionStorage.removeItem(PASS); } catch (e) { /* blocked */ } };

  const adapter = {
    get mode() { return shared.on ? 'shared' : 'demo'; },
    get label() { return shared.on ? 'Shared mode: edits are saved for everyone who uses the builder' : 'Demo mode: edits are saved in this browser only'; },
    read() {
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    write(data) {
      if (shared.on) { BH.store.queuePush(); return true; }
      try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
    },
    history() {
      if (shared.on) return shared.hist;
      try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; }
    },
    pushHistory(data, note) {
      if (shared.on) { shared.snapNote = note || 'Saved version'; return; }
      try {
        const h = adapter.history();
        h.unshift({ at: new Date().toISOString(), note: note || 'Saved version', data });
        localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 8)));
      } catch (e) { /* storage full or blocked */ }
    },
  };

  BH.seed = () => BH.deepClean(clone(window.BH_SEED));

  BH.store = {
    data: null,
    adapter,
    async init() {
      try {
        if (location.protocol === 'file:') throw new Error('opened from a file');
        const r = await fetch('api/content', { cache: 'no-store' });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('json')) {
          const j = await r.json();
          if (j && ('data' in j || j.empty)) {
            shared.on = true;
            shared.etag = j.etag || null;
            this.data = j.empty ? BH.seed() : j.data;
          }
        }
      } catch (e) { /* opened from a file, or offline: demo mode */ }
      if (!shared.on) this.data = adapter.read() || BH.seed();
      this.data.settings = Object.assign({}, BH.seed().settings, this.data.settings || {});
      this.snapshotted = false;
    },
    shared() { return shared.on; },
    save() {
      if (shared.on) { this.queuePush(); return; }
      if (!this.snapshotted) { adapter.pushHistory(this.data, 'Before this editing session'); this.snapshotted = true; }
      const ok = adapter.write(this.data);
      BH.toast(ok ? 'Saved' : 'Could not save in this browser');
    },
    /* debounced save used while typing */
    touch() {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.save(), 500);
    },

    /* ---- shared mode ---- */
    status(msg) { const el = document.getElementById('save-status'); if (el) el.textContent = msg || ''; },
    queuePush() {
      shared.dirty = true;
      this.status('Saving...');
      clearTimeout(shared.timer);
      shared.timer = setTimeout(() => this.push(), 1200);
    },
    async checkPass(pass) {
      try {
        const r = await fetch('api/unlock', { method: 'POST', headers: { 'x-edit-passcode': pass } });
        if (r.ok) return { ok: true };
        const j = await r.json().catch(() => ({}));
        return { ok: false, msg: j.error || 'That passcode is not right.' };
      } catch (e) { return { ok: false, msg: 'Could not reach the server. Check your connection.' }; }
    },
    /* Ask for the passcode once per browser tab. Resolves true when editing is allowed. */
    async ensureUnlocked() {
      if (!shared.on || shared.unlocked) return true;
      const saved = getPass();
      if (saved && (await this.checkPass(saved)).ok) { shared.unlocked = true; return true; }
      setPass('');
      return new Promise((resolve) => {
        const dlg = document.getElementById('dlg');
        dlg.innerHTML = '';
        const mk = (tag, attrs, text) => { const el = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v)); if (text) el.textContent = text; return el; };
        const input = mk('input', { type: 'password', id: 'pw', autocomplete: 'current-password' });
        const err = mk('p', { class: 'lede', style: 'color:var(--accent-ink);min-height:1.2em;margin:8px 0 0', 'aria-live': 'polite' });
        const go = mk('button', { class: 'btn primary', type: 'button' }, 'Unlock editing');
        const cancel = mk('button', { class: 'btn ghost', type: 'button' }, 'Cancel');
        const finish = (v) => { dlg.close(); resolve(v); };
        const submit = async () => {
          if (!input.value) { err.textContent = 'Please enter the passcode.'; return; }
          go.disabled = true; err.textContent = '';
          const r = await this.checkPass(input.value);
          go.disabled = false;
          if (r.ok) { setPass(input.value); shared.unlocked = true; finish(true); } else { err.textContent = r.msg; input.select(); }
        };
        go.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        cancel.addEventListener('click', () => finish(false));
        dlg.addEventListener('cancel', () => resolve(false), { once: true });
        const lab = mk('label', { class: 'f', for: 'pw' }, 'Passcode');
        const act = mk('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:14px' });
        act.append(cancel, go);
        dlg.append(mk('h3', {}, 'Editing needs the passcode'), mk('p', { style: 'margin:0 0 12px;font-size:14px;color:var(--ink-subtle)' }, 'Anyone can view and build packets. Changing the content for everyone needs the team passcode.'), lab, input, err, act);
        dlg.showModal();
        input.focus();
      });
    },
    async push() {
      if (!shared.on || !shared.dirty || shared.conflict) return;
      if (shared.saving) { shared.again = true; return; }
      if (!getPass()) { if (!(await this.ensureUnlocked())) { this.status('Not saved'); return; } }
      shared.saving = true; shared.dirty = false;
      const note = shared.snapNote; shared.snapNote = null;
      const retry = (msg) => { shared.dirty = true; if (note && !shared.snapNote) shared.snapNote = note; this.status(msg); clearTimeout(shared.timer); shared.timer = setTimeout(() => this.push(), 6000); };
      try {
        const r = await fetch('api/content', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-edit-passcode': getPass() },
          body: JSON.stringify({ data: this.data, ifMatch: shared.etag, snapshot: note }),
        });
        if (r.ok) { const j = await r.json(); shared.etag = j.etag; if (!shared.dirty) this.status('Saved for everyone'); }
        else if (r.status === 409) { shared.conflict = true; shared.dirty = true; this.status('Not saved: newer version exists'); this.showConflict(); }
        else if (r.status === 401) { setPass(''); shared.unlocked = false; shared.dirty = true; if (note) shared.snapNote = note; this.status('Passcode needed'); shared.saving = false; this.push(); return; }
        else retry('Could not save. Trying again...');
      } catch (e) { retry('Offline. Will keep trying...'); }
      shared.saving = false;
      if (shared.again) { shared.again = false; this.push(); }
    },
    showConflict() {
      const dlg = document.getElementById('dlg');
      dlg.innerHTML = '';
      const mk = (tag, attrs, text) => { const el = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v)); if (text) el.textContent = text; return el; };
      const act = mk('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:14px' });
      const dl = mk('button', { class: 'btn secondary', type: 'button' }, 'Download my version');
      const load = mk('button', { class: 'btn primary', type: 'button' }, 'Load the latest');
      dl.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([this.exportJson()], { type: 'application/json' }));
        a.download = 'my-unsaved-packet-changes.json'; document.body.appendChild(a); a.click(); a.remove();
      });
      load.addEventListener('click', async () => {
        try {
          const r = await fetch('api/content', { cache: 'no-store' });
          const j = await r.json();
          if (j.data) { this.data = j.data; this.data.settings = Object.assign({}, BH.seed().settings, this.data.settings || {}); }
          shared.etag = j.etag || null; shared.conflict = false; shared.dirty = false; shared.snapNote = null;
          this.status('Loaded the latest version');
          dlg.close();
          if (BH.admin) BH.admin.render();
          if (BH.build) BH.build.refresh();
        } catch (e) { BH.toast('Could not load. Try again.'); }
      });
      act.append(dl, load);
      dlg.append(mk('h3', {}, 'Someone else saved changes first'), mk('p', { style: 'margin:0 0 6px;font-size:14px' }, 'Another person saved the content while you were editing. To avoid overwriting their work, your latest changes were not saved.'), mk('p', { style: 'margin:0;font-size:14px;color:var(--ink-subtle)' }, 'Download your version if you want to keep your changes, then load the latest and make them again.'), act);
      dlg.addEventListener('cancel', (e) => e.preventDefault(), { once: true });
      if (!dlg.open) dlg.showModal();
    },
    /* Earlier versions kept on the server. Resolves true when the list changed. */
    async refreshHistory() {
      if (!shared.on) return false;
      try {
        const r = await fetch('api/content?history=1', { cache: 'no-store', headers: { 'x-edit-passcode': getPass() } });
        if (!r.ok) return false;
        const j = await r.json();
        const changed = JSON.stringify((j.history || []).map((x) => x.at)) !== JSON.stringify(shared.hist.map((x) => x.at));
        shared.hist = j.history || [];
        return changed;
      } catch (e) { return false; }
    },
    resetAll() {
      adapter.pushHistory(this.data, 'Before reset to original');
      this.data = BH.seed();
      adapter.write(this.data);
    },
    exportJson() { return JSON.stringify(this.data, null, 2); },
    importJson(text) {
      const d = JSON.parse(text);
      if (!d || !d.part1 || !d.areas || !d.teams || !d.roles) throw new Error('This file is not a packet content backup.');
      adapter.pushHistory(this.data, 'Before import');
      this.data = BH.deepClean(d);
      adapter.write(this.data);
    },
    restore(i) {
      const h = adapter.history();
      if (!h[i]) return;
      this.data = h[i].data;
      adapter.write(this.data);
    },
    uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8); },
  };

  let toastT;
  BH.toast = function (msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1600);
  };
})();
