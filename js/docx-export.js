/* Word export built from the same content blocks as the preview. */
(function () {
  const BH = (window.BH = window.BH || {});
  const D = window.docx;
  /* The docx library expects Node's Buffer when embedding fonts. Browsers only need concat. */
  if (typeof window.Buffer === 'undefined') {
    window.Buffer = { concat(parts) { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let k = 0; parts.forEach((p) => { o.set(p, k); k += p.length; }); return o; } };
  }

  const INK = '23272A', MUTED = '4E535B', TEAL = '45A5AA', TEAL_INK = '276A70', TEAL_SUB = 'D0EAEB', OVERLAY = 'F2EFE8', LINE = 'C9C5B7';
  const BODY = 'Open Sans', HEAD = 'Montserrat Bold BH', BOLD = 'Open Sans Bold BH', ITAL = 'Open Sans Italic BH';
  const W = 9792; // content width in twips (letter, 0.85in margins)

  const t = (s) => BH.clean(s == null ? '' : String(s));
  /* Bold and italic come from their own embedded font files, so Word shows the true brand weights. */
  const run = (text, o) => {
    o = Object.assign({}, o || {});
    let font = o.font || BODY;
    if (o.bold && font === BODY) { font = BOLD; }
    if (o.italics && font === BODY) { font = ITAL; }
    delete o.bold; delete o.italics;
    return new D.TextRun(Object.assign({ text: t(text), size: 21, color: INK }, o, { font }));
  };
  const hrun = (text, o) => {
    o = Object.assign({}, o || {});
    delete o.bold;
    return new D.TextRun(Object.assign({ text: t(text), color: INK, size: 21 }, o, { font: HEAD }));
  };

  function b64ToBytes(b64) {
    const b = atob(b64);
    const a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  function dataUrlToBytes(u) {
    const b = atob(u.split(',')[1]);
    const a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }

  const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const thin = { style: D.BorderStyle.SINGLE, size: 4, color: LINE };
  const allThin = { top: thin, bottom: thin, left: thin, right: thin };
  const noB = { top: none, bottom: none, left: none, right: none };

  function para(runs, o) {
    return new D.Paragraph(Object.assign({ children: runs, spacing: { after: 120, line: 300 } }, o || {}));
  }

  function leadRuns(b) {
    const r = [];
    if (b.lead) r.push(run(b.lead + ' ', { bold: true }));
    r.push(run(b.x));
    return r;
  }

  function cell(children, o) {
    return new D.TableCell(Object.assign({
      children,
      margins: { top: 90, bottom: 90, left: 140, right: 140 },
      borders: allThin,
      verticalAlign: D.VerticalAlign.TOP,
    }, o || {}));
  }

  function kvTable(rows, labelW) {
    labelW = labelW || 3300;
    return new D.Table({
      width: { size: W, type: D.WidthType.DXA },
      columnWidths: [labelW, W - labelW],
      rows: rows.map((r) => new D.TableRow({
        cantSplit: true,
        children: [
          cell([para([hrun(r[0], { size: 19, color: MUTED })], { spacing: { after: 0 } })], { width: { size: labelW, type: D.WidthType.DXA }, shading: { type: D.ShadingType.CLEAR, fill: OVERLAY, color: 'auto' } }),
          cell([para([run(r[1])], { spacing: { after: 0 } })], { width: { size: W - labelW, type: D.WidthType.DXA } }),
        ],
      })),
    });
  }

  function gridTable(head, rows) {
    const n = (head || rows[0] || []).length || 1;
    const cw = Math.floor(W / n);
    const cols = Array(n).fill(cw);
    const mk = (r, isHead) => new D.TableRow({
      tableHeader: !!isHead,
      cantSplit: true,
      children: r.map((c) => cell([para([isHead ? hrun(c, { size: 17, color: MUTED }) : run(c, { size: 20 })], { spacing: { after: 0 } })], {
        width: { size: cw, type: D.WidthType.DXA },
        shading: isHead ? { type: D.ShadingType.CLEAR, fill: OVERLAY, color: 'auto' } : undefined,
      })),
    });
    const trs = [];
    if (head) trs.push(mk(head, true));
    rows.forEach((r) => trs.push(mk(r, false)));
    return new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: cols, rows: trs });
  }

  function calloutTable(lines) {
    const kids = lines.map((l, i) => {
      const m = /^([^:]{1,40}):\s+(.*)$/.exec(l);
      if (i === 0) return para([hrun(l, { size: 22 })], { spacing: { after: 100 } });
      if (m && !/:$/.test(l)) return para([run(m[1] + ': ', { bold: true }), run(m[2])], { spacing: { after: 60, line: 290 } });
      return para([run(l)], { spacing: { after: 60 } });
    });
    return new D.Table({
      width: { size: W, type: D.WidthType.DXA }, columnWidths: [W],
      rows: [new D.TableRow({ children: [new D.TableCell({ children: kids, width: { size: W, type: D.WidthType.DXA }, shading: { type: D.ShadingType.CLEAR, fill: TEAL_SUB, color: 'auto' }, margins: { top: 140, bottom: 120, left: 220, right: 220 }, borders: noB })] })],
    });
  }

  const gap = (after) => new D.Paragraph({ children: [], spacing: { after: after == null ? 120 : after } });

  function blocksToDocx(blocks) {
    const out = [];
    (blocks || []).forEach((b) => {
      switch (b.t) {
        case 'title':
          out.push(new D.Paragraph({ children: [hrun(b.x, { size: 40, bold: true })], spacing: { before: 120, after: 160 }, keepNext: true }));
          break;
        case 'h':
          out.push(new D.Paragraph({
            children: [hrun(b.x.toUpperCase(), { size: 18, color: TEAL_INK, characterSpacing: 20 })],
            spacing: { before: 320, after: 100 }, keepNext: true,
            border: { bottom: { style: D.BorderStyle.SINGLE, size: 8, color: TEAL_SUB, space: 3 } },
          }));
          break;
        case 'p': out.push(para(leadRuns(b))); break;
        case 'li':
          out.push(new D.Paragraph({ children: leadRuns(b), numbering: { reference: 'bul', level: 0 }, spacing: { after: 80, line: 300 } }));
          break;
        case 'q':
          out.push(new D.Paragraph({
            children: [run(b.x, { italics: true, size: 22 })].concat(b.ref ? [hrun('  ' + b.ref, { size: 18, color: TEAL_INK })] : []),
            shading: { type: D.ShadingType.CLEAR, fill: TEAL_SUB, color: 'auto' },
            indent: { left: 200, right: 200 }, spacing: { before: 80, after: 160, line: 320 },
          }));
          break;
        case 'callout': out.push(calloutTable(b.lines || []), gap(140)); break;
        case 'kv': out.push(kvTable(b.rows || []), gap(140)); break;
        case 'table': out.push(gridTable(b.head, b.rows || []), gap(140)); break;
        default: break;
      }
    });
    return out;
  }

  function banner(label) {
    return new D.Table({
      width: { size: W, type: D.WidthType.DXA }, columnWidths: [W],
      rows: [new D.TableRow({ children: [new D.TableCell({
        width: { size: W, type: D.WidthType.DXA },
        shading: { type: D.ShadingType.CLEAR, fill: TEAL, color: 'auto' },
        margins: { top: 140, bottom: 140, left: 220, right: 220 }, borders: noB,
        children: [new D.Paragraph({ children: [hrun(label.toUpperCase(), { size: 19, characterSpacing: 40 })] })],
      })] })],
    });
  }

  BH.buildDocx = async function (roleId, ov) {
    const { d, role, team, area } = BH.packetParts(roleId);
    const s = d.settings;
    const titles = ['Serving at Burnt Hickory', area.name, team.name, role.title];
    const logo = dataUrlToBytes(window.BH_ASSETS.logo);

    const cover = [
      new D.Paragraph({ children: [new D.ImageRun({ data: logo, type: 'png', transformation: { width: 250, height: Math.round(250 * window.BH_ASSETS.logoH / window.BH_ASSETS.logoW) } })], spacing: { after: 240 } }),
      new D.Paragraph({ children: [hrun(s.church.toUpperCase(), { size: 17, color: TEAL_INK, characterSpacing: 50 })], spacing: { after: 100 } }),
      new D.Paragraph({ children: [hrun(s.welcome, { size: 68, bold: true })], spacing: { after: 100 } }),
      new D.Paragraph({ children: [run(s.tagline, { size: 28, color: MUTED })], spacing: { after: 360 } }),
      kvTable(BH.coverRows(role, ov)),
      gap(300),
      new D.Paragraph({ children: [hrun('IN THIS PACKET', { size: 17, color: TEAL_INK, characterSpacing: 50 })], spacing: { after: 120 } }),
      new D.Table({
        width: { size: W, type: D.WidthType.DXA }, columnWidths: [1300, W - 1300],
        rows: s.parts.map((p, i) => new D.TableRow({ cantSplit: true, children: [
          cell([para([hrun('PART ' + (i + 1), { size: 17, color: TEAL_INK })], { spacing: { after: 0 } })], { width: { size: 1300, type: D.WidthType.DXA }, borders: { top: none, left: none, right: none, bottom: thin } }),
          cell([para([hrun(titles[i], { size: 22 })], { spacing: { after: 20 } }), para([run(p.toc, { size: 19, color: MUTED })], { spacing: { after: 0 } })], { width: { size: W - 1300, type: D.WidthType.DXA }, borders: { top: none, left: none, right: none, bottom: thin } }),
        ] })),
      }),
      gap(160),
      para([run(s.intro, { color: MUTED })]),
    ];

    const brk = () => new D.Paragraph({ children: [new D.PageBreak()] });
    const ack = [
      new D.Paragraph({ children: [hrun('ACKNOWLEDGMENT', { size: 18, color: TEAL_INK, characterSpacing: 20 })], spacing: { before: 360, after: 120 }, keepNext: true, border: { bottom: { style: D.BorderStyle.SINGLE, size: 8, color: TEAL_SUB, space: 3 } } }),
    ].concat(s.ack.map((a) => new D.Paragraph({ children: [new D.CheckBox({ checked: false }), run('  ' + a)], spacing: { after: 120, line: 300 } })));
    const line = { style: D.BorderStyle.SINGLE, size: 6, color: MUTED };
    const sigCell = (txt, w) => new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, borders: { top: line, bottom: none, left: none, right: none }, margins: { top: 60, left: 0, right: 80 }, children: [para([hrun(txt, { size: 16, color: MUTED })], { spacing: { after: 0 } })] });
    const blankCell = (w) => new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, borders: noB, children: [new D.Paragraph({ children: [], spacing: { before: 520 } })] });
    const sigW = [5200, 400, 2400];
    const sig = new D.Table({
      width: { size: 8000, type: D.WidthType.DXA }, columnWidths: sigW,
      rows: [
        new D.TableRow({ cantSplit: true, children: [blankCell(sigW[0]), blankCell(sigW[1]), blankCell(sigW[2])] }),
        new D.TableRow({ cantSplit: true, children: [sigCell('Volunteer signature', sigW[0]), blankCell(sigW[1]), sigCell('Date', sigW[2])] }),
        new D.TableRow({ cantSplit: true, children: [blankCell(sigW[0]), blankCell(sigW[1]), blankCell(sigW[2])] }),
        new D.TableRow({ cantSplit: true, children: [sigCell((role.signer || 'Leader') + ' signature', sigW[0]), blankCell(sigW[1]), sigCell('Date', sigW[2])] }),
      ],
    });

    const children = [].concat(
      cover, brk(),
      banner(s.parts[0].label), gap(160), blocksToDocx(d.part1), brk(),
      banner(s.parts[1].label), gap(160), blocksToDocx([{ t: 'title', x: area.name }].concat(area.blocks)), brk(),
      banner(s.parts[2].label), gap(160), blocksToDocx([{ t: 'title', x: team.name }].concat(team.blocks)), brk(),
      banner(s.parts[3].label), gap(160), blocksToDocx([{ t: 'title', x: role.title }]),
      [new D.Paragraph({ children: [hrun('\u00a0\u00a0' + role.level.toUpperCase() + '\u00a0\u00a0', { size: 17, color: 'FFFFFF', characterSpacing: 30, shading: { type: D.ShadingType.CLEAR, fill: INK, color: 'auto' } })], spacing: { after: 200 } })],
      blocksToDocx(role.blocks), ack, [sig]
    );

    const doc = new D.Document({
      creator: s.church, title: role.title + ' Packet',
      fonts: Object.keys(window.BH_DOCFONTS).map((name) => ({ name, data: b64ToBytes(window.BH_DOCFONTS[name]), characterSet: D.CharacterSet.ANSI })),
      styles: { default: { document: { run: { font: BODY, size: 21, color: INK } } } },
      numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { color: TEAL_INK, font: BODY } } }] }] },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1224, right: 1224 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [run(s.church + ' | ' + role.title + ' | Page ', { size: 16, color: MUTED }), new D.TextRun({ children: [D.PageNumber.CURRENT], font: BODY, size: 16, color: MUTED })] })] }) },
        children,
      }],
    });
    return D.Packer.toBlob(doc);
  };
})();
