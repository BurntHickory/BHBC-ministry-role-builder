/* The "Build a packet" screen. */
(function () {
  const BH = (window.BH = window.BH || {});
  const $ = (id) => document.getElementById(id);
  const st = { area: null, team: null, role: null };
  const lvlClass = (l) => (/coach/i.test(l) ? 'coach' : /leader/i.test(l) ? 'leader' : '');

  function roleList(teamId) {
    const d = BH.store.data;
    return Object.values(d.roles).filter((r) => r.team === teamId).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  const open = { areas: new Set(), teams: new Set() };
  let query = '';

  BH.build = {
    init() {
      $('pick').addEventListener('click', (e) => {
        const dsc = e.target.closest('[data-disc]');
        if (dsc) {
          const set = dsc.dataset.disc === 'area' ? open.areas : open.teams;
          const id = dsc.dataset.id;
          if (set.has(id)) set.delete(id); else set.add(id);
          this.renderPick();
          const again = document.querySelector('[data-disc="' + dsc.dataset.disc + '"][data-id="' + CSS.escape(id) + '"]');
          if (again) again.focus();
          return;
        }
        const b = e.target.closest('[data-role]');
        if (b) { this.select(b.dataset.role); }
      });
      $('role-search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); this.renderPick(); });
      ['in-vol', 'in-leader', 'in-start'].forEach((id) => $(id).addEventListener('input', () => this.preview()));
      $('add-area').addEventListener('click', async () => { if (await BH.store.ensureUnlocked()) BH.admin.addArea(); });
      $('add-team').addEventListener('click', async () => { if (await BH.store.ensureUnlocked()) BH.admin.addTeam(st.area); });
      $('btn-import').addEventListener('click', async () => { if (await BH.store.ensureUnlocked()) BH.importer.open(); });
      $('btn-docx').addEventListener('click', () => this.download());
      $('btn-print').addEventListener('click', () => window.print());
      $('jump').addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#part-"]');
        if (!a) return;
        e.preventDefault();
        const el = document.querySelector(a.getAttribute('href'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      this.refresh();
    },

    renderPick() {
      const d = BH.store.data;
      const q = query;
      const match = (txt) => !q || txt.toLowerCase().includes(q);
      const areas = Object.values(d.areas);
      let html = '<ul>';
      let shown = 0;
      areas.forEach((a) => {
        const teams = Object.values(d.teams).filter((t) => t.area === a.id);
        const areaHit = match(a.name);
        const teamHtml = [];
        teams.forEach((t) => {
          const roles = roleList(t.id);
          const teamHit = areaHit || match(t.name);
          const rolesShown = roles.filter((r) => teamHit || match(r.title));
          if (q && !teamHit && !rolesShown.length) return;
          const isOpen = q ? true : open.teams.has(t.id);
          const rid = 'roles-' + t.id;
          teamHtml.push('<li><button type="button" class="disc team" data-disc="team" data-id="' + BH.esc(t.id) + '" aria-expanded="' + isOpen + '" aria-controls="' + BH.esc(rid) + '"><span class="chev" aria-hidden="true"></span><span>' + BH.esc(t.name) + '</span><span class="cnt">' + roles.length + (roles.length === 1 ? ' role' : ' roles') + '</span></button>' +
            '<ul class="lvl-role" id="' + BH.esc(rid) + '"' + (isOpen ? '' : ' hidden') + '>' +
            (rolesShown.length ? rolesShown.map((r) => '<li><button type="button" class="role-btn" data-role="' + BH.esc(r.id) + '" aria-pressed="' + (r.id === st.role) + '"><b>' + BH.esc(r.title) + '</b><span class="chip ' + lvlClass(r.level) + '">' + BH.esc(r.level) + '</span></button></li>').join('') : '<li class="none">No roles on this team yet.</li>') +
            '</ul></li>');
        });
        if (q && !areaHit && !teamHtml.length) return;
        shown++;
        const isOpen = q ? true : open.areas.has(a.id);
        const tid = 'teams-' + a.id;
        html += '<li><button type="button" class="disc" data-disc="area" data-id="' + BH.esc(a.id) + '" aria-expanded="' + isOpen + '" aria-controls="' + BH.esc(tid) + '"><span class="chev" aria-hidden="true"></span><span>' + BH.esc(a.name) + '</span><span class="cnt">' + teams.length + (teams.length === 1 ? ' team' : ' teams') + '</span></button>' +
          '<ul class="lvl-team" id="' + BH.esc(tid) + '"' + (isOpen ? '' : ' hidden') + '>' + (teamHtml.length ? teamHtml.join('') : '<li class="none">No teams yet.</li>') + '</ul></li>';
      });
      html += '</ul>';
      if (!shown) html = '<p class="none">Nothing matches "' + BH.esc(query) + '".</p>';
      $('pick').innerHTML = html;
      const cr = $('crumb');
      if (st.role && d.roles[st.role]) {
        const r = d.roles[st.role], t = d.teams[r.team], a = d.areas[t.area];
        cr.textContent = 'Selected: ' + a.name + ' > ' + t.name + ' > ' + r.title;
      } else cr.textContent = '';
    },

    overrides() {
      return { volunteer: $('in-vol').value.trim(), leader: $('in-leader').value.trim(), start: BH.fmtDate($('in-start').value) };
    },

    refresh() {
      const d = BH.store.data;
      if (st.role && !d.roles[st.role]) st.role = null;
      if (st.team && !d.teams[st.team]) st.team = null;
      if (st.area && !d.areas[st.area]) st.area = null;
      if (st.area) open.areas.add(st.area);
      if (st.team) open.teams.add(st.team);
      this.renderPick();
      $('btn-docx').disabled = !st.role;
      $('btn-print').disabled = !st.role;
      this.preview();
    },

    preview() {
      const box = $('preview');
      const jump = $('jump');
      if (!st.role) {
        box.innerHTML = '<div class="panel empty" style="padding:48px 24px"><h2 style="font-size:20px;margin-bottom:8px;color:var(--ink)">Choose a role to see its packet</h2>Open a ministry area, then a team, and then pick a role on the left. The full four-part packet appears here.</div>';
        jump.innerHTML = '';
        return;
      }
      const s = BH.store.data.settings;
      jump.innerHTML = '<a href="#part-1">Part 1</a><a href="#part-2">Part 2</a><a href="#part-3">Part 3</a><a href="#part-4">Part 4</a>';
      box.innerHTML = BH.packetHtml(st.role, this.overrides());
    },

    async download() {
      if (!st.role) return;
      const msg = $('docx-msg');
      msg.textContent = 'Building your packet...';
      try {
        const blob = await BH.buildDocx(st.role, this.overrides());
        const role = BH.store.data.roles[st.role];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = role.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-Packet.docx';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        msg.textContent = 'Downloaded ' + a.download;
      } catch (e) {
        console.error(e);
        msg.textContent = 'Something went wrong building the file. Please try again.';
      }
    },

    setSelection(areaId, teamId) {
      st.area = areaId; st.team = teamId || null; st.role = null; this.refresh();
    },
    current() { return Object.assign({}, st); },
    select(roleId) {
      const r = BH.store.data.roles[roleId];
      if (!r) return;
      st.role = roleId; st.team = r.team; st.area = BH.store.data.teams[r.team].area; this.refresh();
    },
  };
})();
