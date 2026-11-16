/* Turns content blocks into the packet preview. */
(function () {
  const BH = (window.BH = window.BH || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = (s) => esc(BH.clean(s));
  BH.esc = esc;

  const lead = (b) => (b.lead ? '<strong>' + C(b.lead) + '</strong> ' : '');

  BH.blocksHtml = function (blocks) {
    let out = '';
    let inList = false;
    (blocks || []).forEach((b) => {
      if (b.t !== 'li' && inList) { out += '</ul>'; inList = false; }
      switch (b.t) {
        case 'title': out += '<h3 class="t">' + C(b.x) + '</h3>'; break;
        case 'h': out += '<h4 class="h">' + C(b.x) + '</h4>'; break;
        case 'p': out += '<p>' + lead(b) + C(b.x) + '</p>'; break;
        case 'li':
          if (!inList) { out += '<ul>'; inList = true; }
          out += '<li>' + lead(b) + C(b.x) + '</li>';
          break;
        case 'q':
          out += '<blockquote class="quote"><p>' + C(b.x) + '</p>' + (b.ref ? '<cite>' + C(b.ref) + '</cite>' : '') + '</blockquote>';
          break;
        case 'callout':
          out += '<div class="callout">' + (b.lines || []).map((l) => {
            const m = /^([^:]{1,40}):\s+(.*)$/.exec(l);
            return '<p>' + (m && !/:$/.test(l) ? '<strong>' + C(m[1]) + ':</strong> ' + C(m[2]) : C(l)) + '</p>';
          }).join('') + '</div>';
          break;
        case 'kv':
          out += '<table class="dt kv"><tbody>' + (b.rows || []).map((r) => '<tr><th scope="row">' + C(r[0]) + '</th><td>' + C(r[1]) + '</td></tr>').join('') + '</tbody></table>';
          break;
        case 'table':
          out += '<table class="dt">' + (b.head ? '<thead><tr>' + b.head.map((h) => '<th>' + C(h) + '</th>').join('') + '</tr></thead>' : '') +
            '<tbody>' + (b.rows || []).map((r) => '<tr>' + r.map((c) => '<td>' + C(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
          break;
        default: break;
      }
    });
    if (inList) out += '</ul>';
    return out;
  };

  const part = (n, label, inner, id) =>
    '<section class="part" id="' + id + '"><div class="part-banner">' + C(label) + '</div>' + inner + '</section>';

  BH.coverRows = function (role, ov) {
    ov = ov || {};
    return role.cover.map((r) => {
      let v = r[1];
      if (r[0] === 'Volunteer' && ov.volunteer) v = ov.volunteer;
      if (r[0] === 'Direct leader' && ov.leader) v = ov.leader;
      if (r[0] === 'Start date' && ov.start) v = ov.start;
      return [r[0], v];
    });
  };

  BH.fmtDate = function (iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  BH.packetParts = function (roleId) {
    const d = BH.store.data;
    const role = d.roles[roleId];
    const team = d.teams[role.team];
    const area = d.areas[team.area];
    return { d, role, team, area };
  };

  BH.packetHtml = function (roleId, ov) {
    const { d, role, team, area } = BH.packetParts(roleId);
    const s = d.settings;
    const parts = s.parts;
    const titles = ['Serving at Burnt Hickory', area.name, team.name, role.title];
    const cover =
      '<header class="cover"><img class="mark" alt="" src="' + window.BH_ASSETS.logo + '">' +
      '<p class="church">' + C(s.church) + '</p><h1>' + C(s.welcome) + '</h1><p class="tag">' + C(s.tagline) + '</p>' +
      '<table class="kvt"><tbody>' + BH.coverRows(role, ov).map((r) => '<tr><th scope="row">' + C(r[0]) + '</th><td>' + C(r[1]) + '</td></tr>').join('') + '</tbody></table></header>';
    const toc = '<section class="toc"><h2>In this packet</h2><ol>' + parts.map((p, i) =>
      '<li><span class="pn">Part ' + (i + 1) + '</span><div><b>' + C(titles[i]) + '</b><span>' + C(p.toc) + '</span></div></li>').join('') + '</ol>' +
      '<p>' + C(s.intro) + '</p></section>';

    // Part 1 title is the first block when it is a title
    const p1 = d.part1;
    const p1Title = p1[0] && p1[0].t === 'title' ? '' : '';
    const ackHtml = '<h4 class="h">Acknowledgment</h4><div class="ack">' + s.ack.map((a) => '<div class="box"><i></i><span>' + C(a) + '</span></div>').join('') +
      '<div class="sig"><div>Volunteer signature</div><div>Date</div><div>' + C(role.signer || 'Leader') + ' signature</div><div>Date</div></div></div>';

    const body =
      part(1, parts[0].label, BH.blocksHtml(p1), 'part-1') +
      part(2, parts[1].label, '<h3 class="t">' + C(area.name) + '</h3>' + BH.blocksHtml(area.blocks), 'part-2') +
      part(3, parts[2].label, '<h3 class="t">' + C(team.name) + '</h3>' + BH.blocksHtml(team.blocks), 'part-3') +
      part(4, parts[3].label, '<h3 class="t">' + C(role.title) + '</h3><span class="lvl">' + C(role.level) + '</span>' + BH.blocksHtml(role.blocks) + ackHtml, 'part-4');
    return '<article class="packet">' + cover + toc + body + '<footer class="pfoot">' + C(s.church) + ' | ' + C(role.title) + '</footer></article>';
  };

  /* Preview for a single editable node in the admin screen */
  BH.nodePreview = function (kind, id) {
    const d = BH.store.data;
    const s = d.settings;
    if (kind === 'part1') return part(1, s.parts[0].label, BH.blocksHtml(d.part1), 'p1');
    if (kind === 'area') { const a = d.areas[id]; return part(2, s.parts[1].label, '<h3 class="t">' + C(a.name) + '</h3>' + BH.blocksHtml(a.blocks), 'p2'); }
    if (kind === 'team') { const t = d.teams[id]; return part(3, s.parts[2].label, '<h3 class="t">' + C(t.name) + '</h3>' + BH.blocksHtml(t.blocks), 'p3'); }
    if (kind === 'role') { const r = d.roles[id]; return part(4, s.parts[3].label, '<h3 class="t">' + C(r.title) + '</h3><span class="lvl">' + C(r.level) + '</span>' + BH.blocksHtml(r.blocks), 'p4'); }
    return '';
  };
})();
