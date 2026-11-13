/* Live tables and charts for the case-study tab. Every number is computed by the same engine as the calculator. */
(function () {
  'use strict';
  const E = window.SSEngine, P = window.SSPresets;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x) => (x * 100).toFixed(1) + '%';
  let rendered = false;
  const charts = {};

  function cfgOf(key, mutate) { const c = P.presets[key](); if (mutate) mutate(c); return c; }
  const seatShare = (cfg, ci) => {
    const W = cfg.members.reduce((s, m) => s + (Number(m.weight) || 0), 0) || 1;
    const c = cfg.coalitions[ci];
    return c.members.reduce((s, id) => s + (Number(cfg.members.find((m) => m.id === id).weight) || 0), 0) / W;
  };
  const setCoh = (ci, coh) => (c) => { c.coalitions[ci].cohesion = Object.assign({ p: 0.8, k: 2, n: 2 }, coh); };
  const allIndep = (c) => c.coalitions.forEach((x) => (x.cohesion = { type: 'independent' }));

  /* rows: [{label, key, mutate, rule, coal}] -> table with seat share and power */
  function scenarioTable(el, rows, coalLabel) {
    const html = rows.map((r) => {
      const cfg = cfgOf(r.key, r.mutate);
      const res = E.computeAll(cfg);
      const power = res.rules[r.rule].coalitionPower[cfg.coalitions[r.coal].id];
      const share = seatShare(cfg, r.coal);
      return `<tr><td>${r.label}</td><td class="num">${pct(share)}</td><td class="num"><b>${pct(power)}</b></td><td class="num">${(power / share).toFixed(2)}×</td></tr>`;
    }).join('');
    el.innerHTML = `<div class="tablewrap"><table><thead><tr><th>Scenario</th><th class="num">${coalLabel} seat share</th><th class="num">Shapley-Shubik power</th><th class="num">Power ÷ seats</th></tr></thead><tbody>${html}</tbody></table></div>`;
  }

  /* full matrix: coalitions x rules for a config */
  function matrixTable(el, key, mutate, opts) {
    const cfg = cfgOf(key, mutate);
    const res = E.computeAll(cfg);
    const rules = opts && opts.rules ? opts.rules : res.rules.map((_, i) => i);
    const coals = opts && opts.coals ? opts.coals : cfg.coalitions.map((_, i) => i);
    el.innerHTML = `<div class="tablewrap"><table><thead><tr><th>${opts && opts.first ? opts.first : 'Coalition'}</th><th class="num">Seats</th>${rules.map((i) => `<th class="num">${esc(res.rules[i].rule.name)}</th>`).join('')}</tr></thead><tbody>
      ${coals.map((ci) => { const c = cfg.coalitions[ci]; return `<tr><td>${esc(c.name)}</td><td class="num">${pct(seatShare(cfg, ci))}</td>${rules.map((i) => `<td class="num">${res.rules[i].coalitionPower[c.id].toFixed(4)}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>`;
  }
  function memberTable(el, key, mutate, groupNames) {
    const cfg = cfgOf(key, mutate);
    const res = E.computeAll(cfg);
    // one representative per coalition (members are symmetric within a faction)
    const rows = cfg.coalitions.map((c) => {
      const id = c.members[0];
      return `<tr><td>${esc(groupNames ? groupNames(c) : c.name)}</td><td class="num">${c.members.length}</td>${res.rules.map((r) => `<td class="num">${r.memberPower.get(id).toFixed(4)}</td>`).join('')}${res.rules.map((r) => `<td class="num">${r.coalitionPower[c.id].toFixed(4)}</td>`).join('')}</tr>`;
    }).join('');
    el.innerHTML = `<div class="tablewrap"><table><thead><tr><th rowspan="2">Faction</th><th rowspan="2" class="num">Members</th><th colspan="${res.rules.length}" class="num">Power of each individual member</th><th colspan="${res.rules.length}" class="num">Faction total</th></tr>
      <tr>${res.rules.map((r) => `<th class="num">${esc(r.rule.name.split(' (')[0])}</th>`).join('')}${res.rules.map((r) => `<th class="num">${esc(r.rule.name.split(' (')[0])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* power of the Trusts' "line": expected power of the nominees who follow the Trusts */
  function followerPower(key, coalIdx, ruleIdx, p) {
    const cfg = cfgOf(key, setCoh(coalIdx, { type: 'probMember', p }));
    const res = E.computeAll(cfg);
    const rr = res.rules[ruleIdx];
    let tot = 0;
    for (const s of rr.scenarios) {
      const opt = s.scenario.options[coalIdx];
      const fol = opt.followers || [];
      tot += s.prob * fol.reduce((a, id) => a + s.memberPower.get(id), 0);
    }
    return tot;
  }

  function line(id, labels, series, xTitle) {
    const ctx = document.getElementById(id);
    if (!ctx || !window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, borderDash: s.dash || [], tension: 0 })) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#fcfcfb', titleColor: '#0b0b0b', bodyColor: '#52514e', borderColor: 'rgba(11,11,11,0.15)', borderWidth: 1, padding: 10, usePointStyle: true,
            callbacks: { title: (it) => `p = ${it[0].label}`, label: (it) => ` ${it.dataset.label}: ${it.parsed.y.toFixed(3)}` } },
        },
        scales: {
          x: { title: { display: true, text: xTitle, color: '#52514e' }, grid: { display: false }, border: { color: '#c3c2b7' }, ticks: { color: '#898781', maxTicksLimit: 11 } },
          y: { title: { display: true, text: 'Shapley-Shubik power', color: '#52514e' }, min: 0, max: 1, grid: { color: '#e1e0d9' }, border: { display: false }, ticks: { color: '#898781' } },
        },
      },
    });
    const leg = document.getElementById(id + '-legend');
    if (leg) leg.innerHTML = series.map((s) => `<span><span class="swatch" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('');
  }

  function render() {
    if (rendered) return;
    rendered = true;
    const C = window.SSApp ? window.SSApp.colors : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

    // ---------- assignment ----------
    matrixTable($('#as-q1'), 'assignment', null, { first: 'Faction (votes as a bloc)' });
    memberTable($('#as-q2'), 'assignment', allIndep);

    // ---------- Tata ----------
    scenarioTable($('#tata-board'), [
      { label: 'No Article 121 (plain majority), nominees united', key: 'tata2026', rule: 0, coal: 0 },
      { label: 'Article 121, nominees united (vote as the Trusts direct)', key: 'tata2026', rule: 1, coal: 0 },
      { label: "Article 121, nominees independent - Trusts' reading (each nominee holds a veto)", key: 'tata2026', mutate: setCoh(0, { type: 'independent' }), rule: 1, coal: 0 },
      { label: "Article 121, nominees independent - Tata Sons' reading (casting vote cures a 1-1 split)", key: 'tata2026', mutate: setCoh(0, { type: 'independent' }), rule: 2, coal: 0 },
      { label: '2025-style board, 3 nominees united, Article 121 (2 of 3 needed)', key: 'tata2025', rule: 1, coal: 0 },
      { label: '2025-style board, 3 nominees independent, Article 121', key: 'tata2025', mutate: setCoh(0, { type: 'independent' }), rule: 1, coal: 0 },
    ], 'Trust nominees\'');
    matrixTable($('#tata-matrix'), 'tata2026', setCoh(0, { type: 'independent' }), { first: 'Group (nominees voting independently)' });
    matrixTable($('#tata-sh'), 'tataShareholders', null, { first: 'Shareholder (Trusts united)' });
    matrixTable($('#tata-sh-split'), 'tataShareholders', setCoh(0, { type: 'independent' }), { first: 'Shareholder (each trust votes on its own)' });

    const ps = Array.from({ length: 21 }, (_, i) => i / 20);
    const tl = ps.map((p) => followerPower('tata2026', 0, 1, p));
    const ts = ps.map((p) => followerPower('tata2026', 0, 2, p));
    const nom = E.sweepP(cfgOf('tata2026'), { model: 'probMember', targets: [cfgOf('tata2026').coalitions[0].id], ruleIndex: 1, ps });
    const nomSeries = nom.series[Object.keys(nom.series)[0]];
    line('tata-chart', ps.map((p) => p.toFixed(2)), [
      { label: "Power of the Trusts' line - Trusts' reading of Art. 121", data: tl, color: C[0] },
      { label: "Power of the Trusts' line - Tata Sons' reading", data: ts, color: C[1] },
      { label: "Both nominees' combined personal power, Trusts' reading (dashed)", data: nomSeries, color: C[2], dash: [6, 4] },
    ], 'Probability p that each nominee director follows the Trusts\' instruction');
    $('#tata-p-half').textContent = pct(tl[10]);
    $('#tata-p-half-ts').textContent = pct(ts[10]);

    // ---------- Anthropic ----------
    scenarioTable($('#anth-board'), [
      { label: 'Ordinary resolution, 7 seats filled, Class T directors united', key: 'anthropicBoard', rule: 0, coal: 0 },
      { label: 'Ordinary resolution, 7 seats, Class T independent, founder-side directors united', key: 'anthropicBoard', mutate: setCoh(0, { type: 'independent' }), rule: 0, coal: 0 },
      { label: 'Ordinary resolution, 7 seats, every director independent', key: 'anthropicBoard', mutate: (c) => { c.coalitions[0].cohesion = { type: 'independent' }; c.coalitions[1].cohesion = { type: 'independent' }; }, rule: 0, coal: 0 },
      { label: 'Ordinary resolution today (4th Class T seat vacant), both sides united', key: 'anthropicVacancy', rule: 0, coal: 0 },
      { label: '80% of Whole Board (6 of 7), both sides united', key: 'anthropicBoard', rule: 1, coal: 0 },
    ], 'Class T (LTBT-elected)');
    matrixTable($('#anth-trust'), 'anthropicTrust', null, { first: 'Body (each votes as a bloc)', coals: [0, 1, 2] });
    matrixTable($('#anth-stock'), 'anthropicStock', null, { first: 'Holder (Founder LLC acts as one share)' });
    matrixTable($('#anth-stock-split'), 'anthropicStock', setCoh(0, { type: 'independent' }), { first: 'Holder (if each co-founder voted separately)' });

    const fullCfg = cfgOf('anthropicBoard');
    const full = E.sweepP(fullCfg, { model: 'probMember', targets: [fullCfg.coalitions[0].id], ruleIndex: 0, ps });
    const vacCfg = cfgOf('anthropicVacancy');
    const vac = E.sweepP(vacCfg, { model: 'probMember', targets: [vacCfg.coalitions[0].id], ruleIndex: 0, ps });
    line('anth-chart', ps.map((p) => p.toFixed(2)), [
      { label: 'Class T directors, all 7 seats filled', data: full.series[fullCfg.coalitions[0].id], color: C[0] },
      { label: 'Class A/F directors, all 7 seats filled', data: full.series[fullCfg.coalitions[1].id], color: C[1] },
      { label: 'Class T directors, 4th seat vacant today (dashed)', data: vac.series[vacCfg.coalitions[0].id], color: C[0], dash: [6, 4] },
    ], 'Probability p that each Class T director votes with the LTBT-aligned bloc');
  }

  window.SSCases = { render };
})();
