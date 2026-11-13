/* UI for the Shapley-Shubik board power lab */
(function () {
  'use strict';
  const E = window.SSEngine, P = window.SSPresets;
  const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  const OTHER = '#898781';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x) => (x == null || !isFinite(x) ? '–' : (x * 100).toFixed(2) + '%');
  const dec = (x) => (x == null || !isFinite(x) ? '–' : x.toFixed(4));
  let uid = 1000;
  const nid = (p) => `${p}${++uid}${Math.random().toString(36).slice(2, 5)}`;

  let config = null;
  let results = null;
  let presetKey = 'assignment';
  const charts = {};

  const colorOf = (i) => (i < PALETTE.length ? PALETTE[i] : OTHER);
  const coalColor = (cid) => colorOf(config.coalitions.findIndex((c) => c.id === cid));

  // ---------- state ----------
  function loadPreset(key) {
    presetKey = key;
    config = P.presets[key]();
    $('#preset').value = key;
    renderEditor();
    recompute();
  }
  function touch() {
    clearTimeout(touch.t);
    touch.t = setTimeout(recompute, 180);
  }

  // ---------- editor ----------
  function renderEditor() {
    $('#cfg-title').value = config.title || '';
    $('#cfg-desc').textContent = config.description || '';
    $('#overlap').value = config.overlapMode || 'merge';
    renderMembers();
    renderCoalitions();
    renderRules();
  }

  function renderMembers() {
    const tb = $('#members-body');
    const memCoals = (mid) => config.coalitions.filter((c) => c.members.includes(mid));
    tb.innerHTML = config.members.map((m) => `
      <tr data-id="${m.id}">
        <td><input type="text" data-k="name" value="${esc(m.name)}" aria-label="Member name"></td>
        <td><input type="number" data-k="weight" value="${m.weight}" step="any" min="0" aria-label="Votes / weight"></td>
        <td>${memCoals(m.id).map((c) => `<span class="chip"><span class="swatch" style="background:${coalColor(c.id)}"></span>${esc(c.name)}</span>`).join('') || '<span class="muted small">independent</span>'}</td>
        <td><button class="btn ghost" data-act="del" title="Remove member" aria-label="Remove member">✕</button></td>
      </tr>`).join('');
    $('#member-count').textContent = `${config.members.length} members · total weight ${fmtW(config.members.reduce((s, m) => s + (Number(m.weight) || 0), 0))}`;
  }
  const fmtW = (x) => (Math.round(x * 1000) / 1000).toString();

  function cohesionParams(c) {
    const t = c.cohesion.type;
    const size = c.members.length;
    if (t === 'probBloc' || t === 'probMember') return `<label class="field"><span>p</span><input type="number" data-k="p" min="0" max="1" step="0.05" value="${c.cohesion.p ?? 0.8}"></label>`;
    if (t === 'subfactions') return `<label class="field"><span>sub-factions k</span><input type="number" data-k="k" min="1" max="${Math.max(1, size)}" step="1" value="${c.cohesion.k ?? 2}"></label>
      <label class="field"><span>or sizes (e.g. 2,1,1)</span><input type="text" data-k="sizes" value="${esc(c.cohesion.sizes || '')}" style="width:110px"></label>`;
    if (t === 'core') return `<label class="field"><span>N voting together</span><input type="number" data-k="n" min="0" max="${size}" step="1" value="${c.cohesion.n ?? 2}"></label>`;
    return '';
  }

  function renderCoalitions() {
    const box = $('#coalitions');
    box.innerHTML = config.coalitions.map((c, i) => `
      <div class="coal" data-id="${c.id}">
        <div class="row">
          <span class="swatch" style="background:${colorOf(i)}"></span>
          <input type="text" data-k="name" value="${esc(c.name)}" style="flex:1;min-width:160px" aria-label="Coalition name">
          <span class="muted small">${c.members.length} member${c.members.length === 1 ? '' : 's'}</span>
          <button class="btn ghost" data-act="del" title="Remove coalition" aria-label="Remove coalition">✕</button>
        </div>
        <div class="row">
          <label class="field"><span>Voting behaviour inside the coalition</span>
            <select data-k="type">
              ${[['bloc', 'Everyone votes together (bloc)'], ['independent', 'Everyone votes independently'], ['subfactions', 'Splits into k sub-factions'], ['core', 'N members vote together, rest independent'], ['probBloc', 'Votes together with probability p (else all split)'], ['probMember', 'Each member follows the bloc with probability p']]
                .map(([v, l]) => `<option value="${v}" ${c.cohesion.type === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          ${cohesionParams(c)}
        </div>
        <details><summary>Members (${c.members.map((id) => esc(nameOf(id))).join(', ') || 'none'})</summary>
          <div class="memberpick">${config.members.map((m) => `<label><input type="checkbox" data-mid="${m.id}" ${c.members.includes(m.id) ? 'checked' : ''}>${esc(m.name)}</label>`).join('')}</div>
        </details>
      </div>`).join('') || '<p class="muted small">No coalitions yet: every member votes independently.</p>';
  }
  const nameOf = (id) => (config.members.find((m) => m.id === id) || { name: '?' }).name;

  function scopeOptions(sel) {
    return `<option value="all" ${sel === 'all' ? 'selected' : ''}>All members</option>` +
      config.coalitions.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }
  function renderRules() {
    const box = $('#rules');
    box.innerHTML = config.rules.map((r) => `
      <div class="rule" data-id="${r.id}">
        <div class="row"><input type="text" data-k="name" value="${esc(r.name)}" style="flex:1;min-width:200px" aria-label="Rule name">
          <button class="btn ghost" data-act="del-rule" title="Remove rule" aria-label="Remove rule">✕</button></div>
        <div class="small muted" style="margin:2px 0 4px">Passes only if every condition holds:</div>
        ${r.conditions.map((c, j) => `
          <div class="cond" data-j="${j}">
            <span>Yes-votes in</span>
            <select data-ck="scope">${scopeOptions(c.scope)}</select>
            <select data-ck="op">
              <option value="gt" ${c.op === 'gt' ? 'selected' : ''}>more than (%)</option>
              <option value="ge" ${c.op === 'ge' ? 'selected' : ''}>at least (%)</option>
              <option value="count" ${c.op === 'count' ? 'selected' : ''}>at least (votes)</option>
            </select>
            <input type="number" data-ck="value" value="${c.value}" step="any" min="0">
            <button class="btn ghost" data-act="del-cond" title="Remove condition" aria-label="Remove condition">✕</button>
          </div>`).join('')}
        <button class="btn link small" data-act="add-cond">+ Add condition</button>
      </div>`).join('');
  }

  function wireEditor() {
    $('#preset').innerHTML = P.list.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
    $('#preset').addEventListener('change', (e) => loadPreset(e.target.value));
    $('#cfg-title').addEventListener('input', (e) => { config.title = e.target.value; });
    $('#overlap').addEventListener('change', (e) => { config.overlapMode = e.target.value; touch(); });

    // members
    $('#members-body').addEventListener('input', (e) => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const m = config.members.find((x) => x.id === tr.dataset.id);
      if (e.target.dataset.k === 'name') { m.name = e.target.value; renderCoalitions(); renderRulesSoft(); }
      if (e.target.dataset.k === 'weight') { m.weight = Math.max(0, parseFloat(e.target.value) || 0); $('#member-count').textContent = `${config.members.length} members · total weight ${fmtW(config.members.reduce((s, q) => s + (Number(q.weight) || 0), 0))}`; }
      touch();
    });
    $('#members-body').addEventListener('click', (e) => {
      if (e.target.dataset.act !== 'del') return;
      const id = e.target.closest('tr').dataset.id;
      config.members = config.members.filter((m) => m.id !== id);
      config.coalitions.forEach((c) => (c.members = c.members.filter((x) => x !== id)));
      renderEditor(); touch();
    });
    $('#add-member').addEventListener('click', () => {
      config.members.push({ id: nid('m'), name: `Member ${config.members.length + 1}`, weight: 1 });
      renderEditor(); touch();
    });
    $('#quick-add').addEventListener('click', () => {
      const name = $('#qa-name').value.trim() || `Faction ${config.coalitions.length + 1}`;
      const n = Math.max(1, Math.min(30, parseInt($('#qa-size').value, 10) || 1));
      const w = Math.max(0, parseFloat($('#qa-weight').value) || 1);
      const ids = [];
      for (let i = 0; i < n; i++) { const id = nid('m'); ids.push(id); config.members.push({ id, name: n > 1 ? `${name} ${i + 1}` : name, weight: w }); }
      config.coalitions.push({ id: nid('c'), name, members: ids, cohesion: { type: 'bloc', p: 0.8, k: 2, n: 2 } });
      $('#qa-name').value = '';
      renderEditor(); touch();
    });

    // coalitions
    const coalBox = $('#coalitions');
    coalBox.addEventListener('input', (e) => {
      const el = e.target.closest('.coal'); if (!el) return;
      const c = config.coalitions.find((x) => x.id === el.dataset.id);
      const k = e.target.dataset.k;
      if (k === 'name') { c.name = e.target.value; renderMembers(); renderRulesSoft(); }
      else if (k === 'p') c.cohesion.p = Math.max(0, Math.min(1, parseFloat(e.target.value)));
      else if (k === 'k') { c.cohesion.k = Math.max(1, parseInt(e.target.value, 10) || 1); }
      else if (k === 'n') c.cohesion.n = Math.max(0, parseInt(e.target.value, 10) || 0);
      else if (k === 'sizes') c.cohesion.sizes = e.target.value;
      if (k && k !== 'name' && k !== 'type') touch(); else if (k === 'name') touch();
    });
    coalBox.addEventListener('change', (e) => {
      const el = e.target.closest('.coal'); if (!el) return;
      const c = config.coalitions.find((x) => x.id === el.dataset.id);
      if (e.target.dataset.k === 'type') {
        c.cohesion.type = e.target.value;
        if (c.cohesion.p == null) c.cohesion.p = 0.8;
        if (c.cohesion.k == null) c.cohesion.k = 2;
        if (c.cohesion.n == null) c.cohesion.n = 2;
        renderCoalitions(); touch();
      } else if (e.target.dataset.mid) {
        const mid = e.target.dataset.mid;
        if (e.target.checked) { if (!c.members.includes(mid)) c.members.push(mid); c.members.sort((a, b) => config.members.findIndex((m) => m.id === a) - config.members.findIndex((m) => m.id === b)); }
        else c.members = c.members.filter((x) => x !== mid);
        const open = el.querySelector('details').open;
        renderCoalitions(); renderMembers();
        if (open) $(`.coal[data-id="${c.id}"] details`).open = true;
        touch();
      }
    });
    coalBox.addEventListener('click', (e) => {
      if (e.target.dataset.act !== 'del') return;
      const id = e.target.closest('.coal').dataset.id;
      config.coalitions = config.coalitions.filter((c) => c.id !== id);
      config.rules.forEach((r) => r.conditions.forEach((c) => { if (c.scope === id) c.scope = 'all'; }));
      renderEditor(); touch();
    });
    $('#add-coalition').addEventListener('click', () => {
      config.coalitions.push({ id: nid('c'), name: `Coalition ${config.coalitions.length + 1}`, members: [], cohesion: { type: 'bloc', p: 0.8, k: 2, n: 2 } });
      renderEditor(); touch();
    });

    // rules
    const rb = $('#rules');
    rb.addEventListener('input', (e) => {
      const el = e.target.closest('.rule'); if (!el) return;
      const r = config.rules.find((x) => x.id === el.dataset.id);
      if (e.target.dataset.k === 'name') r.name = e.target.value;
      const ck = e.target.dataset.ck;
      if (ck) {
        const j = +e.target.closest('.cond').dataset.j;
        r.conditions[j][ck] = ck === 'value' ? parseFloat(e.target.value) || 0 : e.target.value;
      }
      touch();
    });
    rb.addEventListener('change', (e) => {
      const ck = e.target.dataset.ck; if (!ck || ck === 'value') return;
      const el = e.target.closest('.rule');
      const r = config.rules.find((x) => x.id === el.dataset.id);
      r.conditions[+e.target.closest('.cond').dataset.j][ck] = e.target.value;
      touch();
    });
    rb.addEventListener('click', (e) => {
      const act = e.target.dataset.act; if (!act) return;
      const el = e.target.closest('.rule');
      const r = config.rules.find((x) => x.id === el.dataset.id);
      if (act === 'del-rule') config.rules = config.rules.filter((x) => x !== r);
      if (act === 'add-cond') r.conditions.push({ scope: 'all', op: 'gt', value: 50 });
      if (act === 'del-cond') r.conditions.splice(+e.target.closest('.cond').dataset.j, 1);
      renderRules(); touch();
    });
    $('#add-rule').addEventListener('click', () => {
      config.rules.push({ id: nid('r'), name: `Rule ${config.rules.length + 1}`, conditions: [{ scope: 'all', op: 'gt', value: 50 }] });
      renderRules(); touch();
    });

    $('#dl-excel').addEventListener('click', downloadExcel);
    $('#dl-excel-2').addEventListener('click', downloadExcel);
    $('#export-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      saveBlob(blob, slug(config.title) + '.json');
    });
    $('#import-json').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { config = sanitize(JSON.parse(await f.text())); renderEditor(); recompute(); toast('Configuration loaded'); }
      catch (err) { toast('Could not read that file'); }
      e.target.value = '';
    });
    $('#share').addEventListener('click', () => {
      const s = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
      const url = location.origin + location.pathname + '#cfg=' + s;
      history.replaceState(null, '', '#cfg=' + s);
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Shareable link copied'), () => toast('Link is in the address bar'));
    });
  }
  function renderRulesSoft() {
    // update scope dropdown labels without losing focus
    $$('#rules select[data-ck="scope"]').forEach((sel) => { const v = sel.value; sel.innerHTML = scopeOptions(v); });
  }
  function sanitize(c) {
    if (!c || !Array.isArray(c.members) || !Array.isArray(c.coalitions) || !Array.isArray(c.rules)) throw new Error('bad');
    c.coalitions.forEach((x) => { x.cohesion = x.cohesion || { type: 'bloc' }; });
    c.overlapMode = c.overlapMode || 'merge';
    return c;
  }
  const slug = (s) => (s || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- compute & results ----------
  function recompute() {
    const t0 = performance.now();
    try { results = E.computeAll(config); }
    catch (err) { console.error(err); $('#results').innerHTML = `<div class="note warn">Error: ${esc(err.message)}</div>`; return; }
    renderResults(performance.now() - t0);
    if ($('#tab-curves').classList.contains('active')) renderCurves();
    else curvesStale = true;
  }
  let curvesStale = true;

  function barCell(x, color) {
    return `<div class="bar" title="${pct(x)}"><i style="width:${Math.max(0, Math.min(1, x || 0)) * 100}%;background:${color}"></i></div>`;
  }

  function renderResults(ms) {
    const box = $('#results');
    const sc = results.scenarioCount;
    const seatTotal = config.members.reduce((s, m) => s + (Number(m.weight) || 0), 0);
    const seatShare = (c) => c.members.reduce((s, id) => s + (Number((config.members.find((m) => m.id === id) || {}).weight) || 0), 0) / (seatTotal || 1);
    let html = `<div class="kpis">
      <div class="kpi"><b>${config.members.length}</b>members</div>
      <div class="kpi"><b>${config.coalitions.length}</b>coalitions</div>
      <div class="kpi"><b>${config.rules.length}</b>decision rules</div>
      <div class="kpi"><b>${sc}${results.sampled ? '*' : ''}</b>voting structure${sc === 1 ? '' : 's'}</div>
      <div class="kpi"><b>${ms < 1 ? '<1' : Math.round(ms)} ms</b>compute time</div></div>`;
    if (results.sampled) html += `<div class="note">* Too many probabilistic structures to enumerate; a random sample of structures was used.</div>`;

    for (const rr of results.rules) {
      html += `<div class="result-rule"><h3>${esc(rr.rule.name)}</h3>
        <div class="small muted">${rr.compiled.map((c) => esc(E.conditionText(c))).join(' <b>and</b> ')} · method: ${esc(rr.method)}</div>`;
      if (!rr.feasible) html += `<div class="note warn">This rule can never pass, even if everyone votes yes, so every index is 0. Check the thresholds.</div>`;
      html += `<div class="tablewrap"><table><thead><tr><th>Coalition</th><th class="num">Seat / vote share</th><th class="num">Shapley-Shubik power</th><th style="width:34%"></th></tr></thead><tbody>`;
      config.coalitions.forEach((c, i) => {
        const v = rr.coalitionPower[c.id];
        html += `<tr><td><span class="swatch" style="background:${colorOf(i)}"></span>${esc(c.name)} <span class="muted small">(${esc(E.cohesionLabel(c.cohesion))})</span></td>
          <td class="num">${pct(seatShare(c))}</td><td class="num"><b>${dec(v)}</b></td><td>${barCell(v, colorOf(i))}</td></tr>`;
      });
      const unaff = config.members.filter((m) => !config.coalitions.some((c) => c.members.includes(m.id)));
      if (unaff.length) {
        const v = unaff.reduce((s, m) => s + rr.memberPower.get(m.id), 0);
        html += `<tr><td><span class="swatch" style="background:${OTHER}"></span>Unaffiliated members</td><td class="num">${pct(unaff.reduce((s, m) => s + (Number(m.weight) || 0), 0) / (seatTotal || 1))}</td><td class="num"><b>${dec(v)}</b></td><td>${barCell(v, OTHER)}</td></tr>`;
      }
      html += `</tbody></table></div>`;
      html += `<details style="margin-top:6px"><summary>Power of each member</summary><div class="tablewrap"><table><thead><tr><th>Member</th><th class="num">Weight</th><th class="num">Power</th></tr></thead><tbody>
        ${config.members.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${fmtW(Number(m.weight) || 0)}</td><td class="num">${dec(rr.memberPower.get(m.id))}</td></tr>`).join('')}
        </tbody></table></div></details>`;
      if (rr.scenarios.length > 1) {
        const top = rr.scenarios.slice().sort((a, b) => b.prob - a.prob).slice(0, 12);
        html += `<details style="margin-top:4px"><summary>Voting structures (${rr.scenarios.length}) and their probabilities</summary><div class="tablewrap"><table><thead><tr><th>Structure</th><th class="num">Probability</th>${config.coalitions.map((c) => `<th class="num">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
          ${top.map((s) => `<tr><td class="small">${esc(s.scenario.description)}</td><td class="num">${s.prob.toFixed(4)}</td>${config.coalitions.map((c) => `<td class="num">${dec(c.members.reduce((acc, id) => acc + s.memberPower.get(id), 0))}</td>`).join('')}</tr>`).join('')}
          </tbody></table>${rr.scenarios.length > 12 ? '<div class="small muted">Showing the 12 most likely structures; the Excel download lists them all.</div>' : ''}</div></details>`;
      } else {
        const s = rr.scenarios[0];
        html += `<details style="margin-top:4px"><summary>Voting blocs used in the calculation (${s.scenario.players.length} players)</summary><ul class="small">${s.scenario.players.map((pl, i) => `<li>${esc(E.playerName(config, pl))}: power ${dec(s.phi[i])}</li>`).join('')}</ul></details>`;
      }
      html += `</div>`;
    }
    box.innerHTML = html;
  }

  // ---------- curves ----------
  function chartColors() {
    return config.coalitions.map((_, i) => colorOf(i));
  }
  function ruleOptionsHTML(sel) {
    return config.rules.map((r, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(r.name)}</option>`).join('') +
      `<option value="-1" ${String(sel) === '-1' ? 'selected' : ''}>Average of all rules</option>`;
  }
  function renderCurveControls() {
    const rs = $('#cv-rule'); const cur = rs.value || '0';
    rs.innerHTML = ruleOptionsHTML(config.rules.length ? (Number(cur) < config.rules.length ? cur : '0') : '-1');
    const multi = config.coalitions.filter((c) => (c.members || []).length >= 1);
    for (const sel of [$('#cv-target'), $('#cv-ktarget')]) {
      const v = sel.value;
      sel.innerHTML = multi.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.members.length})</option>`).join('');
      if (multi.some((c) => c.id === v)) sel.value = v;
      else { const big = multi.slice().sort((a, b) => b.members.length - a.members.length)[0]; if (big) sel.value = big.id; }
    }
    $('#cv-target').disabled = $('#cv-view').value !== 'one';
    $('#cv-ktarget').disabled = $('#cv-kview').value !== 'one';
  }

  function renderCurves() {
    curvesStale = false;
    renderCurveControls();
    if (!config.coalitions.length) { $('#cv-note').textContent = 'Add at least one coalition to plot power against cohesion.'; return; }
    const ruleIndex = parseInt($('#cv-rule').value, 10);
    const model = $('#cv-model').value;
    const view = $('#cv-view').value;
    const ps = Array.from({ length: 21 }, (_, i) => i / 20);
    const colors = chartColors();
    const t0 = performance.now();

    // P chart
    let pSeries;
    if (view === 'own') {
      pSeries = config.coalitions.map((c, i) => {
        const s = E.sweepP(config, { model, targets: [c.id], ruleIndex, ps });
        return { label: c.name, data: s.series[c.id], color: colors[i] };
      });
    } else {
      const targets = view === 'all' ? config.coalitions.map((c) => c.id) : [$('#cv-target').value];
      const s = E.sweepP(config, { model, targets, ruleIndex, ps });
      pSeries = config.coalitions.map((c, i) => ({ label: c.name, data: s.series[c.id], color: colors[i] }));
    }
    drawLine('chart-p', ps.map((p) => p.toFixed(2)), pSeries, 'Probability p that the coalition votes together', 'Shapley-Shubik power');
    fillTable('table-p', 'p', ps.map((p) => p.toFixed(2)), pSeries);

    // K chart
    const kview = $('#cv-kview').value;
    let kLabels, kSeries;
    if (kview === 'own') {
      const sizes = config.coalitions.map((c) => (E.cohesionMembers(config).get(c.id) || []).length);
      const maxK = Math.max(1, ...sizes);
      kLabels = Array.from({ length: maxK }, (_, i) => String(i + 1));
      kSeries = config.coalitions.map((c, i) => {
        const s = E.sweepK(config, { target: c.id, ruleIndex });
        const d = kLabels.map((_, j) => (j < s.ks.length ? s.series[c.id][j] : null));
        return { label: c.name, data: d, color: colors[i] };
      });
    } else {
      const s = E.sweepK(config, { target: $('#cv-ktarget').value, ruleIndex });
      kLabels = s.ks.map(String);
      kSeries = config.coalitions.map((c, i) => ({ label: c.name, data: s.series[c.id], color: colors[i] }));
    }
    drawLine('chart-k', kLabels, kSeries, 'Number of sub-factions voting separately (1 = fully united)', 'Shapley-Shubik power');
    fillTable('table-k', 'k', kLabels, kSeries);
    $('#cv-note').textContent = `Computed in ${Math.round(performance.now() - t0)} ms. Other coalitions keep the voting behaviour set in the calculator.`;
  }

  function drawLine(id, labels, series, xTitle, yTitle) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s) => ({
          label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color,
          borderWidth: 2, pointRadius: labels.length > 12 ? 0 : 4, pointHoverRadius: 5, pointBorderColor: '#fcfcfb', pointBorderWidth: 2,
          tension: 0, spanGaps: false,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fcfcfb', titleColor: '#0b0b0b', bodyColor: '#52514e', borderColor: 'rgba(11,11,11,0.15)', borderWidth: 1,
            padding: 10, boxPadding: 4, usePointStyle: true,
            callbacks: { title: (it) => `${xTitle.startsWith('Prob') ? 'p = ' : 'k = '}${it[0].label}`, label: (it) => ` ${it.dataset.label}: ${it.parsed.y == null ? '–' : it.parsed.y.toFixed(4)}` },
          },
        },
        scales: {
          x: { title: { display: true, text: xTitle, color: '#52514e' }, grid: { display: false }, border: { color: '#c3c2b7' }, ticks: { color: '#898781', maxTicksLimit: 11 } },
          y: { title: { display: true, text: yTitle, color: '#52514e' }, min: 0, suggestedMax: 1, grid: { color: '#e1e0d9' }, border: { display: false }, ticks: { color: '#898781' } },
        },
      },
    });
    const leg = document.getElementById(id + '-legend');
    if (leg) leg.innerHTML = series.map((s) => `<span><span class="swatch" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('');
  }
  function fillTable(id, xname, labels, series) {
    const el = document.getElementById(id);
    el.innerHTML = `<table><thead><tr><th>${xname}</th>${series.map((s) => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>
      ${labels.map((l, i) => `<tr><td class="tnum">${l}</td>${series.map((s) => `<td class="num">${s.data[i] == null ? '–' : s.data[i].toFixed(4)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function wireCurves() {
    ['#cv-rule', '#cv-model', '#cv-view', '#cv-target', '#cv-kview', '#cv-ktarget'].forEach((s) => $(s).addEventListener('change', () => renderCurves()));
  }

  // ---------- Excel ----------
  function downloadExcel() {
    if (!window.XLSX) { toast('Excel library failed to load'); return; }
    toast('Building Excel workbook…');
    setTimeout(() => {
      try {
        const wb = window.SSExcel.build(config, results);
        XLSX.writeFile(wb, slug(config.title) + '-shapley-shubik.xlsx', { compression: true });
      } catch (err) { console.error(err); toast('Excel export failed: ' + err.message); }
    }, 30);
  }

  // ---------- tabs ----------
  function wireTabs() {
    $$('nav.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    const h = location.hash.replace('#', '');
    if (['calc', 'curves', 'cases', 'method'].includes(h)) showTab(h);
  }
  function showTab(name) {
    $$('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('section.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
    if (!location.hash.startsWith('#cfg=')) history.replaceState(null, '', '#' + name);
    if (name === 'curves' && (curvesStale || !charts['chart-p'])) setTimeout(renderCurves, 0);
    if (name === 'cases' && window.SSCases) window.SSCases.render();
    window.scrollTo({ top: 0 });
  }

  // public hook for case studies: open a preset (with overrides) in the calculator
  window.SSApp = {
    open(key, mutate) {
      loadPreset(key);
      if (mutate) { mutate(config); renderEditor(); recompute(); }
      showTab('calc');
    },
    openCurves(key, mutate, opts) {
      loadPreset(key);
      if (mutate) { mutate(config); renderEditor(); recompute(); }
      showTab('curves');
      setTimeout(() => {
        if (opts) {
          if (opts.rule != null) $('#cv-rule').value = String(opts.rule);
          if (opts.model) $('#cv-model').value = opts.model;
          if (opts.view) $('#cv-view').value = opts.view;
          renderCurveControls();
          if (opts.target != null) { $('#cv-target').value = config.coalitions[opts.target].id; $('#cv-ktarget').value = config.coalitions[opts.target].id; }
          renderCurves();
        }
      }, 10);
    },
    colors: PALETTE,
  };

  // ---------- boot ----------
  function boot() {
    wireEditor();
    wireCurves();
    let loaded = false;
    if (location.hash.startsWith('#cfg=')) {
      try { config = sanitize(JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(5)))))); presetKey = ''; renderEditor(); recompute(); loaded = true; }
      catch (e) { console.warn('bad shared config', e); }
    }
    if (!loaded) loadPreset('assignment');
    wireTabs();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
