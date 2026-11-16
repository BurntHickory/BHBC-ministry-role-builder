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

  const adapter = {
    mode: 'demo',
    label: 'Demo mode: edits are saved in this browser only',
    read() {
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    write(data) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
    },
    history() {
      try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; }
    },
    pushHistory(data, note) {
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
    load() {
      this.data = adapter.read() || BH.seed();
      this.data.settings = Object.assign({}, BH.seed().settings, this.data.settings || {});
      this.snapshotted = false;
    },
    save() {
      if (!this.snapshotted) { adapter.pushHistory(this.data, 'Before this editing session'); this.snapshotted = true; }
      const ok = adapter.write(this.data);
      BH.toast(ok ? 'Saved' : 'Could not save in this browser');
    },
    /* debounced save used while typing */
    touch() {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.save(), 500);
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
