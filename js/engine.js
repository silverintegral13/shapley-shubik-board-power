/*
 * Shapley-Shubik power engine
 * ---------------------------------------------------------------
 * Model
 *   members     : [{id, name, weight}]
 *   coalitions  : [{id, name, members:[memberId], cohesion:{type, p, k, n, sizes}}]
 *                 cohesion.type one of
 *                   bloc         - everyone in the coalition votes together
 *                   independent  - every member votes on their own
 *                   subfactions  - split into k sub-factions (or explicit sizes "2,1,1"); each sub-faction votes together
 *                   core         - a core of n members votes together, the rest vote independently
 *                   probBloc     - with probability p the whole coalition votes as a bloc, otherwise everyone votes independently
 *                   probMember   - each member independently follows the coalition line with probability p;
 *                                  followers form one bloc, defectors vote independently
 *   overlapMode : 'merge' - a member who sits in two bloc-voting coalitions ties them together (union of blocs)
 *                 'first' - a member votes with the first coalition (in list order) that contains them;
 *                           they still count towards every coalition's majority condition
 *   rules       : [{id, name, conditions:[{scope:'all'|coalitionId, op:'gt'|'ge'|'count', value}]}]
 *                 A motion passes only if ALL conditions hold.
 *                   gt    : yes-weight in scope  >  value% of scope weight   (e.g. simple majority: gt 50)
 *                   ge    : yes-weight in scope  >= value% of scope weight   (e.g. 80% supermajority: ge 80)
 *                   count : yes-weight in scope  >= value                    (e.g. at least 4 directors)
 *
 * Shapley-Shubik index of player i (a "player" is a group of members that votes together):
 *   phi_i = sum over S subset of N\{i}  |S|! (n-|S|-1)! / n!  * [v(S u {i}) - v(S)]
 * i.e. the share of the n! voting orders in which i is pivotal. A player's power is split
 * among its members in proportion to weight; a coalition's power is the sum over its members.
 * Probabilistic cohesion is handled by enumerating every voting structure ("scenario"),
 * computing the index for each, and taking the probability-weighted expectation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-9;
  const EXACT_MAX_PLAYERS = 20;
  const MAX_SCENARIOS = 4096;
  const MC_PERMUTATIONS = 40000;
  const MC_SCENARIOS = 600;

  const FACT = [1];
  for (let i = 1; i <= 40; i++) FACT[i] = FACT[i - 1] * i;
  const fact = (n) => FACT[n];

  // ---------- helpers ----------
  function splitEven(ids, k) {
    k = Math.max(1, Math.min(Math.round(k) || 1, ids.length || 1));
    const out = [];
    const base = Math.floor(ids.length / k), extra = ids.length % k;
    let pos = 0;
    for (let g = 0; g < k; g++) {
      const sz = base + (g < extra ? 1 : 0);
      if (sz > 0) out.push(ids.slice(pos, pos + sz));
      pos += sz;
    }
    return out;
  }
  function splitSizes(ids, sizesStr) {
    const sizes = String(sizesStr || '').split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0);
    const out = [];
    let pos = 0;
    for (const s of sizes) {
      if (pos >= ids.length) break;
      out.push(ids.slice(pos, pos + s));
      pos += s;
    }
    while (pos < ids.length) out.push([ids[pos++]]);
    return out;
  }
  const singletons = (ids) => ids.map((x) => [x]);

  function cohesionLabel(c) {
    if (!c) return 'bloc';
    switch (c.type) {
      case 'bloc': return 'votes as one bloc';
      case 'independent': return 'members vote independently';
      case 'subfactions': return c.sizes ? `sub-factions of sizes ${c.sizes}` : `${c.k} sub-factions`;
      case 'core': return `core of ${c.n} votes together, rest independent`;
      case 'probBloc': return `bloc with probability ${fmtP(c.p)}, else independent`;
      case 'probMember': return `each member follows the bloc with probability ${fmtP(c.p)}`;
      default: return c.type;
    }
  }
  const fmtP = (p) => (Math.round(Number(p) * 1000) / 1000).toString();

  /* Options for one coalition: list of {groups, kind, k, m, prob}
   * kind: 'fixed' | 'bloc' | 'indep' | 'follow'   (the last three depend on p) */
  function coalitionOptions(coh, ids) {
    const m = ids.length;
    if (m === 0) return [{ groups: [], kind: 'fixed', prob: 1, label: '' }];
    const t = (coh && coh.type) || 'bloc';
    const p = clamp01(coh && coh.p != null ? Number(coh.p) : 1);
    switch (t) {
      case 'independent':
        return [{ groups: singletons(ids), kind: 'fixed', prob: 1, label: 'independent' }];
      case 'subfactions': {
        const groups = coh.sizes ? splitSizes(ids, coh.sizes) : splitEven(ids, coh.k || 2);
        return [{ groups, kind: 'fixed', prob: 1, label: `${groups.length} sub-factions (${groups.map((g) => g.length).join('+')})` }];
      }
      case 'core': {
        const n = Math.max(0, Math.min(m, Math.round(coh.n || 0)));
        const groups = n > 0 ? [ids.slice(0, n)].concat(singletons(ids.slice(n))) : singletons(ids);
        return [{ groups, kind: 'fixed', prob: 1, label: `core of ${n}` }];
      }
      case 'probBloc':
        if (m === 1) return [{ groups: [ids.slice()], kind: 'fixed', prob: 1, label: 'single member' }];
        return [
          { groups: [ids.slice()], kind: 'bloc', m, prob: p, label: 'bloc' },
          { groups: singletons(ids), kind: 'indep', m, prob: 1 - p, label: 'split (all independent)' },
        ];
      case 'probMember': {
        if (m === 1) return [{ groups: [ids.slice()], kind: 'fixed', prob: 1, label: 'single member' }];
        const opts = [];
        if (m <= 12) {
          for (let mask = 0; mask < 1 << m; mask++) {
            const fol = [], def = [];
            for (let j = 0; j < m; j++) (mask >> j) & 1 ? fol.push(ids[j]) : def.push(ids[j]);
            const k = fol.length;
            opts.push({
              groups: (fol.length ? [fol] : []).concat(singletons(def)),
              kind: 'follow', k, m, prob: Math.pow(p, k) * Math.pow(1 - p, m - k),
              label: `followers: ${k}/${m}`, followers: fol,
            });
          }
        } else {
          // large coalition: approximate by follower count (first k members follow)
          for (let k = 0; k <= m; k++) {
            const fol = ids.slice(0, k), def = ids.slice(k);
            opts.push({
              groups: (fol.length ? [fol] : []).concat(singletons(def)),
              kind: 'follow', k, m, mult: binom(m, k),
              prob: binom(m, k) * Math.pow(p, k) * Math.pow(1 - p, m - k),
              label: `followers: ${k}/${m}`, followers: fol,
            });
          }
        }
        return opts;
      }
      case 'bloc':
      default:
        return [{ groups: [ids.slice()], kind: 'fixed', prob: 1, label: 'bloc' }];
    }
  }
  function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
  function clamp01(x) { return isFinite(x) ? Math.max(0, Math.min(1, x)) : 1; }

  function optionProb(opt, p) {
    switch (opt.kind) {
      case 'bloc': return p;
      case 'indep': return 1 - p;
      case 'follow': return (opt.mult || 1) * Math.pow(p, opt.k) * Math.pow(1 - p, opt.m - opt.k);
      default: return 1;
    }
  }

  // ---------- structure ----------
  function memberIndex(config) {
    const idx = new Map();
    config.members.forEach((m, i) => idx.set(m.id, i));
    return idx;
  }

  /* ids each coalition "controls" for cohesion purposes (overlap handling) */
  function cohesionMembers(config) {
    const valid = new Set(config.members.map((m) => m.id));
    const out = new Map();
    if (config.overlapMode === 'first') {
      const owner = new Map();
      for (const c of config.coalitions) for (const id of c.members) if (valid.has(id) && !owner.has(id)) owner.set(id, c.id);
      for (const c of config.coalitions) out.set(c.id, c.members.filter((id) => valid.has(id) && owner.get(id) === c.id));
    } else {
      for (const c of config.coalitions) out.set(c.id, c.members.filter((id) => valid.has(id)));
    }
    return out;
  }

  /* Build the list of scenarios (voting structures).
   * overrides: {coalitionId: cohesion}  replaces the configured cohesion */
  function enumerateScenarios(config, overrides) {
    overrides = overrides || {};
    const cm = cohesionMembers(config);
    const per = config.coalitions.map((c) => ({
      coal: c,
      cohesion: overrides[c.id] || c.cohesion || { type: 'bloc' },
      options: coalitionOptions(overrides[c.id] || c.cohesion || { type: 'bloc' }, cm.get(c.id) || []),
    }));
    let total = 1;
    for (const x of per) total *= x.options.length;
    const scenarios = [];
    if (total <= MAX_SCENARIOS) {
      const choice = new Array(per.length).fill(0);
      const rec = (d) => {
        if (d === per.length) {
          scenarios.push(buildScenario(config, per, choice.slice()));
          return;
        }
        for (let o = 0; o < per[d].options.length; o++) { choice[d] = o; rec(d + 1); }
      };
      rec(0);
      return { per, scenarios, sampled: false };
    }
    // Monte-Carlo over scenarios
    const rnd = mulberry32(12345);
    const seen = new Map();
    for (let s = 0; s < MC_SCENARIOS; s++) {
      const choice = per.map((x) => sampleIndex(x.options.map((o) => o.prob), rnd));
      const key = choice.join(',');
      if (seen.has(key)) seen.get(key).count++;
      else { const sc = buildScenario(config, per, choice); sc.count = 1; seen.set(key, sc); scenarios.push(sc); }
    }
    for (const sc of scenarios) sc.sampleWeight = sc.count / MC_SCENARIOS;
    return { per, scenarios, sampled: true };
  }
  function sampleIndex(probs, rnd) {
    let r = rnd(), acc = 0;
    for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (r <= acc) return i; }
    return probs.length - 1;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildScenario(config, per, choice) {
    const idx = memberIndex(config);
    const n = config.members.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
    const parts = [];
    per.forEach((x, d) => {
      const opt = x.options[choice[d]];
      for (const g of opt.groups) for (let j = 1; j < g.length; j++) union(idx.get(g[0]), idx.get(g[j]));
      if (x.options.length > 1 || x.cohesion.type !== 'bloc') {
        let label = opt.label;
        if (opt.followers) {
          const nm = (mid) => config.members[idx.get(mid)].name;
          label = opt.followers.length ? `${opt.followers.length}/${opt.m} follow the bloc (${opt.followers.map(nm).join(', ')})` : `0/${opt.m} follow (all vote independently)`;
        }
        parts.push({ coalition: x.coal.name, label });
      }
    });
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(config.members[i].id);
    }
    const players = Array.from(groups.values());
    return {
      choice,
      options: per.map((x, d) => x.options[choice[d]]),
      players,
      description: parts.map((q) => `${q.coalition}: ${q.label}`).join('; ') || 'deterministic structure',
    };
  }

  function scenarioProb(sc, per, pOverride) {
    if (sc.sampleWeight != null) return sc.sampleWeight;
    let pr = 1;
    per.forEach((x, d) => {
      const opt = sc.options[d];
      const p = pOverride && pOverride[x.coal.id] != null ? pOverride[x.coal.id] : clamp01(x.cohesion.p != null ? Number(x.cohesion.p) : 1);
      pr *= opt.kind === 'fixed' ? 1 : optionProb(opt, p);
    });
    return pr;
  }

  // ---------- rules ----------
  function compileRule(config, rule) {
    const coalById = new Map(config.coalitions.map((c) => [c.id, c]));
    const allIds = config.members.map((m) => m.id);
    const wOf = new Map(config.members.map((m) => [m.id, Number(m.weight) || 0]));
    return (rule.conditions || []).map((cond) => {
      const scopeIds = cond.scope === 'all' || !coalById.has(cond.scope) ? allIds : coalById.get(cond.scope).members.filter((id) => wOf.has(id));
      const inScope = new Set(scopeIds);
      const total = scopeIds.reduce((s, id) => s + wOf.get(id), 0);
      const v = Number(cond.value) || 0;
      let threshold, strict;
      if (cond.op === 'count') { threshold = v; strict = false; }
      else if (cond.op === 'ge') { threshold = (v / 100) * total; strict = false; }
      else { threshold = (v / 100) * total; strict = true; }
      const test = strict ? (y) => y > threshold + EPS : (y) => y >= threshold - EPS;
      const scopeName = cond.scope === 'all' || !coalById.has(cond.scope) ? 'All members' : coalById.get(cond.scope).name;
      return { inScope, total, threshold, strict, test, scopeName, cond };
    });
  }
  function conditionText(c) {
    const op = c.cond.op;
    if (op === 'count') return `${c.scopeName}: yes-weight >= ${c.cond.value}`;
    return `${c.scopeName}: yes-weight ${op === 'ge' ? '>=' : '>'} ${c.cond.value}% of ${fmtNum(c.total)} (${c.strict ? '>' : '>='} ${fmtNum(c.threshold)})`;
  }
  const fmtNum = (x) => (Math.round(x * 1000) / 1000).toString();

  function playerVectors(config, players, compiled) {
    const wOf = new Map(config.members.map((m) => [m.id, Number(m.weight) || 0]));
    return players.map((pl) => compiled.map((c) => pl.reduce((s, id) => s + (c.inScope.has(id) ? wOf.get(id) : 0), 0)));
  }
  const passes = (sums, compiled) => compiled.every((c, j) => c.test(sums[j]));

  // ---------- Shapley-Shubik ----------
  function shapleyShubik(vecs, compiled) {
    const n = vecs.length, C = compiled.length;
    const phi = new Array(n).fill(0);
    if (n === 0) return { phi, method: 'exact', feasible: false };
    const grand = new Array(C).fill(0);
    vecs.forEach((v) => v.forEach((x, j) => (grand[j] += x)));
    if (!passes(grand, compiled)) return { phi, method: 'exact', feasible: false };
    if (n <= EXACT_MAX_PLAYERS) {
      const N = 1 << n;
      const sums = compiled.map(() => new Float64Array(N));
      const win = new Uint8Array(N);
      const pc = new Uint8Array(N);
      const tmp = new Array(C);
      for (let j = 0; j < C; j++) tmp[j] = 0;
      win[0] = passes(tmp, compiled) ? 1 : 0;
      for (let mask = 1; mask < N; mask++) {
        const low = mask & -mask;
        const i = 31 - Math.clz32(low);
        const prev = mask ^ low;
        pc[mask] = pc[prev] + 1;
        let ok = 1;
        for (let j = 0; j < C; j++) {
          const s = sums[j][prev] + vecs[i][j];
          sums[j][mask] = s;
          if (ok && !compiled[j].test(s)) ok = 0;
        }
        win[mask] = ok;
      }
      const w = new Float64Array(n);
      for (let s = 0; s < n; s++) w[s] = (fact(s) * fact(n - s - 1)) / fact(n);
      for (let mask = 0; mask < N; mask++) {
        if (win[mask]) continue; // already winning -> nobody pivotal when added
        for (let i = 0; i < n; i++) {
          const b = 1 << i;
          if (mask & b) continue;
          if (win[mask | b]) phi[i] += w[pc[mask]];
        }
      }
      return { phi, method: 'exact', feasible: true };
    }
    // Monte Carlo over orderings
    const rnd = mulberry32(98765);
    const order = Array.from({ length: n }, (_, i) => i);
    const s = new Array(C);
    for (let t = 0; t < MC_PERMUTATIONS; t++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = order[i]; order[i] = order[j]; order[j] = x; }
      for (let j = 0; j < C; j++) s[j] = 0;
      for (let q = 0; q < n; q++) {
        const pl = order[q];
        for (let j = 0; j < C; j++) s[j] += vecs[pl][j];
        if (passes(s, compiled)) { phi[pl] += 1; break; }
      }
    }
    for (let i = 0; i < n; i++) phi[i] /= MC_PERMUTATIONS;
    return { phi, method: 'monte-carlo', feasible: true, samples: MC_PERMUTATIONS };
  }

  function attribute(config, players, phi) {
    const wOf = new Map(config.members.map((m) => [m.id, Number(m.weight) || 0]));
    const out = new Map(config.members.map((m) => [m.id, 0]));
    players.forEach((pl, i) => {
      const W = pl.reduce((s, id) => s + wOf.get(id), 0);
      pl.forEach((id) => out.set(id, out.get(id) + (W > 0 ? (phi[i] * wOf.get(id)) / W : phi[i] / pl.length)));
    });
    return out;
  }
  function coalitionPowers(config, memberPower) {
    const r = {};
    for (const c of config.coalitions) r[c.id] = c.members.reduce((s, id) => s + (memberPower.get(id) || 0), 0);
    return r;
  }

  /* Compute every rule. Returns per-rule results with scenario breakdown. */
  function computeAll(config, overrides, pOverride) {
    const en = enumerateScenarios(config, overrides);
    return computeFromScenarios(config, en, pOverride);
  }
  function computeFromScenarios(config, en, pOverride, cache) {
    const rules = config.rules.map((rule, ri) => {
      const compiled = compileRule(config, rule);
      const expMember = new Map(config.members.map((m) => [m.id, 0]));
      let method = 'exact', feasibleAny = false, totalProb = 0;
      const scen = en.scenarios.map((sc, si) => {
        const key = ri + ':' + si;
        let res = cache && cache.get(key);
        if (!res) {
          const vecs = playerVectors(config, sc.players, compiled);
          const ss = shapleyShubik(vecs, compiled);
          const mp = attribute(config, sc.players, ss.phi);
          res = { ss, mp, vecs };
          if (cache) cache.set(key, res);
        }
        const prob = scenarioProb(sc, en.per, pOverride);
        totalProb += prob;
        if (res.ss.method !== 'exact') method = res.ss.method;
        if (res.ss.feasible) feasibleAny = true;
        res.mp.forEach((v, id) => expMember.set(id, expMember.get(id) + prob * v));
        return { scenario: sc, prob, phi: res.ss.phi, memberPower: res.mp, vecs: res.vecs, feasible: res.ss.feasible };
      });
      if (totalProb > 0 && Math.abs(totalProb - 1) > 1e-9) expMember.forEach((v, id) => expMember.set(id, v / totalProb));
      return {
        rule, compiled, scenarios: scen, memberPower: expMember,
        coalitionPower: coalitionPowers(config, expMember),
        method: en.sampled ? method + ' + sampled scenarios' : method,
        feasible: feasibleAny,
      };
    });
    return { rules, sampled: en.sampled, scenarioCount: en.scenarios.length };
  }

  function averageRules(config, results) {
    const k = results.rules.length || 1;
    const mp = new Map(config.members.map((m) => [m.id, 0]));
    results.rules.forEach((r) => r.memberPower.forEach((v, id) => mp.set(id, mp.get(id) + v / k)));
    return { memberPower: mp, coalitionPower: coalitionPowers(config, mp) };
  }

  /* Power vs probability p.
   * model: 'probBloc' | 'probMember'; targets: [coalitionIds] that get the same p;
   * ruleIndex: index or -1 for the average of all rules.
   * returns {ps, series:{coalitionId:[power per p]}, members:{id:[...]}} */
  function sweepP(config, opts) {
    const ps = opts.ps || Array.from({ length: 21 }, (_, i) => i / 20);
    const overrides = {};
    for (const id of opts.targets) overrides[id] = { type: opts.model, p: 0.5 };
    const en = enumerateScenarios(config, overrides);
    const cache = new Map();
    const series = {}; config.coalitions.forEach((c) => (series[c.id] = []));
    const members = {}; config.members.forEach((m) => (members[m.id] = []));
    for (const p of ps) {
      const po = {}; for (const id of opts.targets) po[id] = p;
      const res = computeFromScenarios(config, en, po, cache);
      const agg = opts.ruleIndex >= 0 ? res.rules[opts.ruleIndex] : averageRules(config, res);
      config.coalitions.forEach((c) => series[c.id].push(agg.coalitionPower[c.id]));
      config.members.forEach((m) => members[m.id].push(agg.memberPower.get(m.id)));
    }
    return { ps, series, members, sampled: en.sampled };
  }

  /* Power vs number of sub-factions k (k = 1 united ... k = size fully independent) for one coalition */
  function sweepK(config, opts) {
    const cm = cohesionMembers(config);
    const size = (cm.get(opts.target) || []).length;
    const ks = Array.from({ length: Math.max(1, size) }, (_, i) => i + 1);
    const series = {}; config.coalitions.forEach((c) => (series[c.id] = []));
    for (const k of ks) {
      const res = computeAll(config, { [opts.target]: { type: 'subfactions', k } });
      const agg = opts.ruleIndex >= 0 ? res.rules[opts.ruleIndex] : averageRules(config, res);
      config.coalitions.forEach((c) => series[c.id].push(agg.coalitionPower[c.id]));
    }
    return { ks, series };
  }

  /* Detail tables for the Excel export (one deterministic scenario) */
  function subsetTable(config, players, compiled, limit) {
    const n = players.length;
    if (n > (limit || 12)) return null;
    const vecs = playerVectors(config, players, compiled);
    const N = 1 << n;
    const rows = [];
    const winOf = (mask) => {
      const s = compiled.map(() => 0);
      for (let i = 0; i < n; i++) if ((mask >> i) & 1) vecs[i].forEach((x, j) => (s[j] += x));
      return { s, win: passes(s, compiled) };
    };
    const winCache = new Array(N);
    for (let mask = 0; mask < N; mask++) winCache[mask] = winOf(mask);
    for (let mask = 0; mask < N; mask++) {
      let size = 0; for (let i = 0; i < n; i++) if ((mask >> i) & 1) size++;
      if (size === n) continue;
      const swings = [];
      for (let i = 0; i < n; i++) {
        if ((mask >> i) & 1) swings.push(null);
        else swings.push(!winCache[mask].win && winCache[mask | (1 << i)].win ? 1 : 0);
      }
      rows.push({ mask, size, sums: winCache[mask].s, win: winCache[mask].win, swings });
    }
    return { n, rows, vecs };
  }
  function orderingTable(config, players, compiled, limit) {
    const n = players.length;
    if (n > (limit || 8) || n === 0) return null;
    const vecs = playerVectors(config, players, compiled);
    const rows = [];
    const perm = Array.from({ length: n }, (_, i) => i);
    const visit = (arr) => {
      const s = compiled.map(() => 0);
      let pivot = -1, pos = -1;
      for (let q = 0; q < n; q++) {
        vecs[arr[q]].forEach((x, j) => (s[j] += x));
        if (passes(s, compiled)) { pivot = arr[q]; pos = q; break; }
      }
      rows.push({ order: arr.slice(), pivot, pos });
    };
    const permute = (k) => {
      if (k === n) { visit(perm); return; }
      for (let i = k; i < n; i++) {
        [perm[k], perm[i]] = [perm[i], perm[k]];
        permute(k + 1);
        [perm[k], perm[i]] = [perm[i], perm[k]];
      }
    };
    // lexicographic order is nicer to read
    const lex = (prefix, rest) => {
      if (!rest.length) { visit(prefix); return; }
      for (let i = 0; i < rest.length; i++) lex(prefix.concat(rest[i]), rest.slice(0, i).concat(rest.slice(i + 1)));
    };
    lex([], perm);
    void permute;
    return { n, rows, vecs };
  }

  function playerName(config, pl) {
    const byId = new Map(config.members.map((m) => [m.id, m.name]));
    if (pl.length === 1) return byId.get(pl[0]);
    // name by coalition if the player equals a coalition exactly
    const set = new Set(pl);
    for (const c of config.coalitions) if (c.members.length === pl.length && c.members.every((id) => set.has(id))) return `${c.name} (bloc of ${pl.length})`;
    if (pl.length <= 3) return pl.map((id) => byId.get(id)).join(' + ');
    return `${byId.get(pl[0])} + ${pl.length - 1} others`;
  }

  return {
    computeAll, sweepP, sweepK, enumerateScenarios, compileRule, conditionText,
    subsetTable, orderingTable, playerName, cohesionLabel, cohesionMembers, averageRules, fact,
    EXACT_MAX_PLAYERS,
  };
});
