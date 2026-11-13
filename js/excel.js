/* Excel export: every step of the Shapley-Shubik computation, with live formulas where possible. */
(function () {
  'use strict';
  const E = window.SSEngine;
  const enc = (r, c) => XLSX.utils.encode_cell({ r, c });
  const col = (c) => XLSX.utils.encode_col(c);

  function sheetFrom(rows, widths) {
    const ws = {};
    let maxR = 0, maxC = 0;
    rows.forEach((row, r) => {
      (row || []).forEach((v, c) => {
        if (v === null || v === undefined || v === '') return;
        let cell;
        if (typeof v === 'object' && (v.f || v.v !== undefined)) {
          cell = { t: typeof v.v === 'string' ? 's' : 'n', v: v.v === undefined ? 0 : v.v };
          if (v.f) cell.f = v.f;
          if (v.z) cell.z = v.z;
        } else if (typeof v === 'number') cell = { t: 'n', v };
        else if (typeof v === 'boolean') cell = { t: 'n', v: v ? 1 : 0 };
        else cell = { t: 's', v: String(v) };
        ws[enc(r, c)] = cell;
        maxC = Math.max(maxC, c);
      });
      maxR = Math.max(maxR, r);
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    return ws;
  }
  const usedNames = new Set();
  function addSheet(wb, name, ws) {
    let base = name.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim();
    let n = base, i = 2;
    while (usedNames.has(n.toLowerCase())) { const suf = ` (${i++})`; n = base.slice(0, 31 - suf.length) + suf; }
    usedNames.add(n.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, n);
    return n;
  }
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function build(config, results) {
    usedNames.clear();
    const wb = XLSX.utils.book_new();
    const memberName = new Map(config.members.map((m) => [m.id, m.name]));

    // ---- README
    addSheet(wb, 'README', sheetFrom([
      ['Shapley-Shubik power analysis: ' + (config.title || 'Board')],
      [config.description || ''],
      [],
      ['Definition'],
      ['Shapley-Shubik index of player i = share of the n! voting orders in which i is pivotal (turns a losing coalition into a winning one).'],
      ['Equivalent subset form: phi_i = SUM over S not containing i of |S|! (n-|S|-1)! / n! x [v(S+i) - v(S)], where v(S)=1 if S passes the rule.'],
      ['A "player" is a group of members who vote together (a bloc). A bloc\'s power is split among its members by weight; a coalition\'s power is the sum over its members.'],
      ['Probabilistic cohesion: every possible voting structure is enumerated with its probability; reported power is the probability-weighted average.'],
      [],
      ['Sheets'],
      ['Inputs', 'members, weights, coalitions, voting behaviour, decision rules'],
      ['Summary', 'power of every coalition and member under every rule'],
      ['R# Subsets', 'every subset S of players: weight formula, whether S passes, and which players swing it (power = SUMPRODUCT of weight x swing)'],
      ['R# Orderings', 'every voting order with its pivotal player (power = COUNTIF / n!) - same method as the class spreadsheet'],
      ['R# Scenarios', 'for probabilistic cohesion: each voting structure, its probability and the resulting power (expected value by SUMPRODUCT)'],
      ['Sweep p / Sweep k', 'power of each coalition vs probability p of voting together, and vs number of sub-factions'],
      [],
      ['Generated', new Date().toISOString()],
    ], [22, 120]));

    // ---- Inputs
    const inp = [['Members'], ['#', 'Member', 'Weight (votes)', 'Coalitions']];
    config.members.forEach((m, i) => inp.push([i + 1, m.name, Number(m.weight) || 0, config.coalitions.filter((c) => c.members.includes(m.id)).map((c) => c.name).join('; ')]));
    inp.push(['', 'Total', { f: `SUM(C3:C${2 + config.members.length})`, v: config.members.reduce((s, m) => s + (Number(m.weight) || 0), 0) }]);
    inp.push([], ['Coalitions'], ['#', 'Coalition', 'Size', 'Voting behaviour', 'p', 'k / N / sizes', 'Members']);
    config.coalitions.forEach((c, i) => {
      const t = c.cohesion.type;
      inp.push([i + 1, c.name, c.members.length, E.cohesionLabel(c.cohesion),
        t === 'probBloc' || t === 'probMember' ? Number(c.cohesion.p) : '',
        t === 'subfactions' ? (c.cohesion.sizes || c.cohesion.k) : t === 'core' ? c.cohesion.n : '',
        c.members.map((id) => memberName.get(id)).join(', ')]);
    });
    inp.push([], ['Overlap handling', config.overlapMode === 'first' ? 'Member votes with the first listed coalition containing them' : 'Overlapping blocs are merged (a shared member ties the blocs together)']);
    inp.push([], ['Decision rules (a motion passes only if all conditions hold)'], ['Rule', 'Condition', 'Scope', 'Operator', 'Value', 'Scope weight', 'Yes-weight needed']);
    results.rules.forEach((rr) => rr.compiled.forEach((c, j) => inp.push([j === 0 ? rr.rule.name : '', j + 1, c.scopeName,
      c.cond.op === 'gt' ? 'more than %' : c.cond.op === 'ge' ? 'at least %' : 'at least (votes)', Number(c.cond.value), c.total,
      c.strict ? `> ${+c.threshold.toFixed(4)}` : `>= ${+c.threshold.toFixed(4)}`])));
    addSheet(wb, 'Inputs', sheetFrom(inp, [6, 34, 14, 46, 8, 14, 60]));

    // ---- Summary
    const sum = [['Shapley-Shubik power by coalition'], ['Coalition', 'Seat/vote share'].concat(results.rules.map((r) => r.rule.name), ['Average of rules'])];
    const W = config.members.reduce((s, m) => s + (Number(m.weight) || 0), 0) || 1;
    const avg = E.averageRules(config, results);
    config.coalitions.forEach((c) => sum.push([c.name, c.members.reduce((s, id) => s + (Number((config.members.find((m) => m.id === id) || {}).weight) || 0), 0) / W]
      .concat(results.rules.map((r) => r.coalitionPower[c.id]), [avg.coalitionPower[c.id]])));
    sum.push([], ['Shapley-Shubik power by member'], ['Member', 'Weight'].concat(results.rules.map((r) => r.rule.name), ['Average of rules']));
    const mStart = sum.length;
    config.members.forEach((m) => sum.push([m.name, Number(m.weight) || 0].concat(results.rules.map((r) => r.memberPower.get(m.id)), [avg.memberPower.get(m.id)])));
    const mEnd = sum.length;
    const tot = ['Total (should be 1)', ''];
    for (let k = 0; k <= results.rules.length; k++) tot.push({ f: `SUM(${col(2 + k)}${mStart + 1}:${col(2 + k)}${mEnd})`, v: 1 });
    sum.push(tot);
    addSheet(wb, 'Summary', sheetFrom(sum, [40, 14].concat(results.rules.map(() => 22), [18])));

    // ---- per rule detail
    results.rules.forEach((rr, ri) => {
      const tag = `R${ri + 1}`;
      const scen = rr.scenarios;
      if (scen.length === 1) {
        detailSheets(wb, config, rr, scen[0], tag, rr.rule.name);
      } else {
        const rows = [[`Rule ${tag}: ${rr.rule.name}`], ['Each row is one possible voting structure. Expected power = SUMPRODUCT(probability, power).'], [],
          ['#', 'Voting structure', 'Probability'].concat(config.coalitions.map((c) => c.name), config.members.map((m) => m.name))];
        const first = rows.length;
        scen.forEach((s, i) => rows.push([i + 1, s.scenario.description, s.prob]
          .concat(config.coalitions.map((c) => c.members.reduce((a, id) => a + s.memberPower.get(id), 0)), config.members.map((m) => s.memberPower.get(m.id)))));
        const last = rows.length;
        const totRow = ['', 'Total probability', { f: `SUM(C${first + 1}:C${last})`, v: scen.reduce((a, s) => a + s.prob, 0) }];
        const expRow = ['', 'Expected power', ''];
        const nCols = config.coalitions.length + config.members.length;
        for (let k = 0; k < nCols; k++) {
          const cl = col(3 + k);
          const v = k < config.coalitions.length ? rr.coalitionPower[config.coalitions[k].id] : rr.memberPower.get(config.members[k - config.coalitions.length].id);
          expRow.push({ f: `SUMPRODUCT($C$${first + 1}:$C$${last},${cl}${first + 1}:${cl}${last})/$C$${last + 1}`, v });
        }
        rows.push(totRow, expRow);
        addSheet(wb, `${tag} Scenarios`, sheetFrom(rows, [6, 60, 12].concat(Array(nCols).fill(16))));
        const top = scen.map((s, i) => ({ s, i })).sort((a, b) => b.s.prob - a.s.prob).slice(0, 3);
        top.forEach(({ s, i }) => detailSheets(wb, config, rr, s, `${tag} S${i + 1}`, `${rr.rule.name} | structure #${i + 1} (p=${s.prob.toFixed(4)}): ${s.scenario.description}`));
      }
    });

    // ---- sweeps
    sweepSheets(wb, config);
    return wb;
  }

  function detailSheets(wb, config, rr, s, tag, title) {
    const players = s.scenario.players;
    const n = players.length;
    const names = players.map((pl) => E.playerName(config, pl));
    const compiled = rr.compiled;
    // Subsets
    const sub = E.subsetTable(config, players, compiled, 12);
    if (sub) {
      const rows = [[`${title}`], ['Players (voting blocs)', '', 'n =', n], [compiled.map((c) => E.conditionText(c)).join('  AND  ')], []];
      rows.push(['Player #', 'Player', 'Members'].concat(compiled.map((c) => `Weight in: ${c.scopeName}`), ['Shapley-Shubik power']));
      const pStart = rows.length;
      players.forEach((pl, i) => rows.push([i + 1, names[i], pl.map((id) => (config.members.find((m) => m.id === id) || {}).name).join(', ')].concat(sub.vecs[i], [null])));
      rows.push([]);
      const head = ['Subset S (players)', '|S|', 'Weight |S|!(n-|S|-1)!/n!'].concat(compiled.map((c) => `Yes-weight: ${c.scopeName}`), ['S passes?'], names.map((nm, i) => `Swing P${i + 1}`));
      rows.push(head);
      const tStart = rows.length;
      const sizeCol = 1, wCol = 2, swingCol0 = 3 + compiled.length + 1;
      sub.rows.forEach((r) => {
        const label = r.mask === 0 ? '{ }' : '{' + players.map((_, i) => ((r.mask >> i) & 1 ? 'P' + (i + 1) : null)).filter(Boolean).join(',') + '}';
        const rowIdx = rows.length + 1;
        rows.push([label, r.size, { f: `FACT(${col(sizeCol)}${rowIdx})*FACT($D$2-${col(sizeCol)}${rowIdx}-1)/FACT($D$2)`, v: (E.fact(r.size) * E.fact(n - r.size - 1)) / E.fact(n) }]
          .concat(r.sums.map((x) => +x.toFixed(6)), [r.win ? 1 : 0], r.swings.map((x) => (x === null ? '' : x))));
      });
      const tEnd = rows.length;
      const pw = ['Power = SUMPRODUCT(weight, swing)', '', ''].concat(compiled.map(() => ''), ['']);
      players.forEach((_, i) => {
        const cl = col(swingCol0 + i);
        pw.push({ f: `SUMPRODUCT($${col(wCol)}$${tStart + 1}:$${col(wCol)}$${tEnd},${cl}${tStart + 1}:${cl}${tEnd})`, v: s.phi[i] });
      });
      rows.push(pw);
      const pwRow = rows.length;
      // link power back into the player table
      players.forEach((_, i) => { rows[pStart + i][3 + compiled.length] = { f: `${col(swingCol0 + i)}${pwRow}`, v: s.phi[i] }; });
      rows.push(['Check: total power', '', ''].concat(compiled.map(() => ''), [''], [{ f: `SUM(${col(swingCol0)}${pwRow}:${col(swingCol0 + n - 1)}${pwRow})`, v: s.phi.reduce((a, b) => a + b, 0) }]));
      addSheet(wb, `${short(tag, 22)} Subsets`, sheetFrom(rows, [26, 8, 22].concat(compiled.map(() => 18), [10], players.map(() => 10))));
    }
    // Orderings
    const ord = E.orderingTable(config, players, compiled, 8);
    if (ord) {
      const rows = [[`${title}`], ['Every ordering of the players; the pivotal player is the one whose yes-vote first makes the motion pass.'], ['n =', n, 'n! =', { f: 'FACT(B3)', v: E.fact(n) }], []];
      rows.push(['Order #'].concat(players.map((_, i) => `Position ${i + 1}`), ['Pivotal player', 'Pivot position']));
      const start = rows.length;
      ord.rows.forEach((r, k) => rows.push([k + 1].concat(r.order.map((i) => names[i]), [r.pivot >= 0 ? names[r.pivot] : 'never passes', r.pos >= 0 ? r.pos + 1 : ''])));
      const end = rows.length;
      const pivCol = col(1 + n);
      rows.push([], ['Player', 'Times pivotal', 'Shapley-Shubik power']);
      players.forEach((_, i) => {
        const rIdx = rows.length + 1;
        const cnt = ord.rows.filter((r) => r.pivot === i).length;
        rows.push([names[i], { f: `COUNTIF($${pivCol}$${start + 1}:$${pivCol}$${end},A${rIdx})`, v: cnt }, { f: `B${rIdx}/$D$3`, v: cnt / E.fact(n) }]);
      });
      addSheet(wb, `${short(tag, 20)} Orderings`, sheetFrom(rows, [30].concat(players.map(() => 24), [24, 12])));
    }
    if (!sub && !ord) {
      const rows = [[title], [`${n} voting blocs: too many to list every subset/ordering in a spreadsheet. Result computed ${rr.method === 'exact' ? 'exactly' : 'by Monte Carlo'} in the browser.`], [], ['Player', 'Power']];
      players.forEach((_, i) => rows.push([names[i], s.phi[i]]));
      addSheet(wb, `${short(tag, 22)} Players`, sheetFrom(rows, [40, 14]));
    }
  }

  function sweepSheets(wb, config) {
    if (!config.coalitions.length) return;
    const ps = Array.from({ length: 21 }, (_, i) => i / 20);
    const ruleIdx = config.rules.map((_, i) => i).concat([-1]);
    const rname = (i) => (i < 0 ? 'Average of all rules' : config.rules[i].name);
    const rows = [['Power of each coalition vs probability p that it votes together (each coalition varies its own p; others keep their configured behaviour)'], []];
    for (const model of ['probBloc', 'probMember']) {
      for (const ri of ruleIdx) {
        rows.push([`Rule: ${rname(ri)}`, `Model: ${model === 'probBloc' ? 'votes together with probability p, otherwise all members split' : 'each member follows the bloc with probability p'}`]);
        rows.push(['p'].concat(config.coalitions.map((c) => c.name)));
        const series = config.coalitions.map((c) => E.sweepP(config, { model, targets: [c.id], ruleIndex: ri, ps }).series[c.id]);
        ps.forEach((p, j) => rows.push([p].concat(series.map((s) => s[j]))));
        rows.push([]);
      }
    }
    addSheet(wb, 'Sweep p', sheetFrom(rows, [26].concat(config.coalitions.map(() => 22))));

    const rk = [['Power of each coalition vs number of sub-factions k it splits into (k = 1 fully united, k = size fully independent)'], []];
    for (const ri of ruleIdx) {
      rk.push([`Rule: ${rname(ri)}`]);
      const sw = config.coalitions.map((c) => E.sweepK(config, { target: c.id, ruleIndex: ri }));
      const maxK = Math.max(...sw.map((s) => s.ks.length));
      rk.push(['k'].concat(config.coalitions.map((c) => c.name)));
      for (let k = 0; k < maxK; k++) rk.push([k + 1].concat(sw.map((s, i) => (k < s.ks.length ? s.series[config.coalitions[i].id][k] : ''))));
      rk.push([]);
    }
    addSheet(wb, 'Sweep k', sheetFrom(rk, [26].concat(config.coalitions.map(() => 22))));
  }

  window.SSExcel = { build };
})();
