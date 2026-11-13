/* Preset boards. Each preset is a full engine config. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSPresets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  let uid = 0;
  const id = (p) => `${p}${++uid}`;

  // Build members + coalitions from [{name, count|members:[{name,weight}], cohesion}]
  function build(title, description, factions, rules, extra) {
    const members = [], coalitions = [];
    for (const f of factions) {
      const ids = [];
      const list = f.members || Array.from({ length: f.count }, (_, i) => ({ name: f.count > 1 ? `${f.memberPrefix || f.name} ${i + 1}` : (f.memberPrefix || f.name), weight: f.weight != null ? f.weight : 1 }));
      for (const m of list) {
        let existing = m.ref ? members.find((x) => x.name === m.ref) : null;
        if (existing) { ids.push(existing.id); continue; }
        const mid = id('m');
        members.push({ id: mid, name: m.name, weight: m.weight != null ? m.weight : 1 });
        ids.push(mid);
      }
      coalitions.push({ id: id('c'), name: f.name, members: ids, cohesion: f.cohesion || { type: 'bloc', p: 0.8, k: 2, n: 2 } });
    }
    const cid = (name) => (name === 'all' ? 'all' : coalitions.find((c) => c.name === name).id);
    const rr = rules.map((r) => ({ id: id('r'), name: r.name, conditions: r.conditions.map((c) => ({ scope: cid(c.scope), op: c.op, value: c.value })) }));
    return Object.assign({ title, description, members, coalitions, rules: rr, overlapMode: 'merge' }, extra || {});
  }
  const C = (type, more) => Object.assign({ type, p: 0.8, k: 2, n: 2 }, more || {});

  const presets = {
    assignment: () => build(
      'University council (assignment)',
      'Board of 11: Students 4, Staff 3, Faculty 2, Alumni 1, Corporate 1. Routine = simple majority; Operational = majority + majority of Faculty; Strategic = majority + majority of Students + majority of Faculty.',
      [
        { name: 'Students', count: 4, memberPrefix: 'Student' },
        { name: 'Staff', count: 3 },
        { name: 'Faculty', count: 2 },
        { name: 'Alumni', count: 1 },
        { name: 'Corporate representation', count: 1, memberPrefix: 'Corporate rep' },
      ],
      [
        { name: 'Routine (simple majority)', conditions: [{ scope: 'all', op: 'gt', value: 50 }] },
        { name: 'Operational (majority + Faculty majority)', conditions: [{ scope: 'all', op: 'gt', value: 50 }, { scope: 'Faculty', op: 'gt', value: 50 }] },
        { name: 'Strategic (majority + Students & Faculty majorities)', conditions: [{ scope: 'all', op: 'gt', value: 50 }, { scope: 'Students', op: 'gt', value: 50 }, { scope: 'Faculty', op: 'gt', value: 50 }] },
      ]
    ),

    sao: () => build(
      'IIMA SAO (class example)',
      'Class example from the slides: PGP 4, PhD 2, ePGP 2, Director\'s nominee 1; simple majority (5 of 9). Expected: PGP 1/2, others 1/6 each.',
      [
        { name: 'PGP', count: 4 },
        { name: 'PhD', count: 2 },
        { name: 'ePGP', count: 2 },
        { name: "Director's nominee", count: 1 },
      ],
      [{ name: 'Simple majority', conditions: [{ scope: 'all', op: 'gt', value: 50 }] }]
    ),

    tata2026: () => build(
      'Tata Sons board (Sept 2026, six directors)',
      'Six directors at the 17 Sept 2026 meeting. Article 121: a board decision needs a board majority AND the affirmative vote of a majority of the Tata Trusts nominee directors present (Art. 104B). With two nominees, a "majority of two" means both.',
      [
        { name: 'Tata Trusts nominees (Art. 104B)', members: [{ name: 'Noel Tata' }, { name: 'Venu Srinivasan' }], cohesion: C('bloc') },
        { name: 'Executive directors', members: [{ name: 'N. Chandrasekaran (Chair)' }, { name: 'Saurabh Agrawal' }], cohesion: C('bloc') },
        { name: 'Independent directors', members: [{ name: 'Harish Manwani' }, { name: 'Anita Marangoly George' }], cohesion: C('independent') },
      ],
      [
        { name: 'Plain board majority (no Article 121)', conditions: [{ scope: 'all', op: 'gt', value: 50 }] },
        { name: "Article 121 - Trusts' reading (both nominees must vote yes)", conditions: [{ scope: 'all', op: 'gt', value: 50 }, { scope: 'Tata Trusts nominees (Art. 104B)', op: 'gt', value: 50 }] },
        { name: "Article 121 - Tata Sons' reading (one nominee + casting vote suffices)", conditions: [{ scope: 'all', op: 'gt', value: 50 }, { scope: 'Tata Trusts nominees (Art. 104B)', op: 'ge', value: 50 }] },
      ]
    ),

    tata2025: () => build(
      'Tata Sons board (illustrative, three Trust nominees)',
      'Illustrative seven-member board while Tata Trusts still had three nominee directors (before Vijay Singh left in 2025). With three nominees, a majority is any two, so a single dissenting nominee can no longer block.',
      [
        { name: 'Tata Trusts nominees (Art. 104B)', members: [{ name: 'Noel Tata' }, { name: 'Venu Srinivasan' }, { name: 'Vijay Singh' }], cohesion: C('bloc') },
        { name: 'Executive directors', members: [{ name: 'N. Chandrasekaran (Chair)' }, { name: 'Saurabh Agrawal' }], cohesion: C('bloc') },
        { name: 'Independent directors', members: [{ name: 'Harish Manwani' }, { name: 'Anita Marangoly George' }], cohesion: C('independent') },
      ],
      [
        { name: 'Plain board majority (no Article 121)', conditions: [{ scope: 'all', op: 'gt', value: 50 }] },
        { name: 'Article 121 (majority of nominees = 2 of 3)', conditions: [{ scope: 'all', op: 'gt', value: 50 }, { scope: 'Tata Trusts nominees (Art. 104B)', op: 'gt', value: 50 }] },
      ]
    ),

    tataShareholders: () => build(
      'Tata Sons shareholders (general meeting)',
      'Shareholding (approx.): Sir Dorabji Tata Trust 27.98%, Sir Ratan Tata Trust 23.56%, other Tata trusts ~14.36% (Tata Trusts ~66% in total); SP Group 18.37% via two companies; Tata group companies 12.86%; individuals/others 2.87%. Ordinary resolution > 50%; special resolution >= 75%.',
      [
        { name: 'Tata Trusts', members: [{ name: 'Sir Dorabji Tata Trust', weight: 27.98 }, { name: 'Sir Ratan Tata Trust', weight: 23.56 }, { name: 'Other Tata trusts', weight: 14.36 }], cohesion: C('bloc') },
        { name: 'Shapoorji Pallonji Group', members: [{ name: 'Sterling Investment Corp', weight: 9.185 }, { name: 'Cyrus Investments', weight: 9.185 }], cohesion: C('bloc') },
        { name: 'Tata group companies', members: [{ name: 'Tata group companies', weight: 12.86 }], cohesion: C('bloc') },
        { name: 'Individuals & others', members: [{ name: 'Individuals & others', weight: 2.87 }], cohesion: C('bloc') },
      ],
      [
        { name: 'Ordinary resolution (> 50%)', conditions: [{ scope: 'all', op: 'gt', value: 50 }] },
        { name: 'Special resolution (>= 75%)', conditions: [{ scope: 'all', op: 'ge', value: 75 }] },
      ]
    ),

    anthropicBoard: () => build(
      'Anthropic board (post-IPO, all seven seats filled)',
      'Seven authorised directors per the S-1: four Class T directors elected by the Long-Term Benefit Trust (one seat currently vacant, filled here) and three elected by Class A + Class F holders (the Founder LLC holds 50.1% of that vote). Ordinary resolutions need a majority of the Whole Board (4 of 7); protected bylaws need 80% of the Whole Board (6 of 7).',
      [
        { name: 'Class T directors (elected by LTBT)', members: [{ name: 'Reed Hastings' }, { name: 'Vas Narasimhan' }, { name: 'Chris Liddell' }, { name: 'Class T director #4' }], cohesion: C('bloc') },
        { name: 'Class A/F directors (Founder LLC controls)', members: [{ name: 'Dario Amodei' }, { name: 'Daniela Amodei (Chair)' }, { name: 'Third Class A/F director' }], cohesion: C('bloc') },
        { name: 'Co-founder executives (overlap)', members: [{ ref: 'Dario Amodei' }, { ref: 'Daniela Amodei (Chair)' }], cohesion: C('bloc') },
      ],
      [
        { name: 'Ordinary resolution (majority of Whole Board, 4 of 7)', conditions: [{ scope: 'all', op: 'count', value: 4 }] },
        { name: '80% of Whole Board (6 of 7)', conditions: [{ scope: 'all', op: 'count', value: 6 }] },
      ],
      { overlapMode: 'first' }
    ),

    anthropicVacancy: () => build(
      'Anthropic board today (one Class T seat vacant)',
      'Same board, but the fourth Class T seat is vacant (weight 0). Thresholds are counted on the Whole Board of 7 authorised seats, so an ordinary resolution still needs 4 yes votes out of 6 sitting directors - and neither side has 4 on its own.',
      [
        { name: 'Class T directors (elected by LTBT)', members: [{ name: 'Reed Hastings' }, { name: 'Vas Narasimhan' }, { name: 'Chris Liddell' }, { name: 'Class T seat #4 (vacant)', weight: 0 }], cohesion: C('bloc') },
        { name: 'Class A/F directors (Founder LLC controls)', members: [{ name: 'Dario Amodei' }, { name: 'Daniela Amodei (Chair)' }, { name: 'Third Class A/F director' }], cohesion: C('bloc') },
      ],
      [
        { name: 'Ordinary resolution (4 of 7 authorised)', conditions: [{ scope: 'all', op: 'count', value: 4 }] },
        { name: '80% of Whole Board (6 of 7 authorised)', conditions: [{ scope: 'all', op: 'count', value: 6 }] },
      ]
    ),

    anthropicTrust: () => build(
      'Anthropic - amending the LTBT (Trust Amendment Threshold)',
      'Route (i) of the Trust Amendment Threshold, with the Trustees in favour: 80% of the authorised directors (6 of 7) AND 80% of the Trustees in office (4 of 5). Compared with an ordinary board resolution, where the Trustees have no direct vote at all.',
      [
        { name: 'Class T directors (elected by LTBT)', members: [{ name: 'Reed Hastings' }, { name: 'Vas Narasimhan' }, { name: 'Chris Liddell' }, { name: 'Class T director #4' }], cohesion: C('bloc') },
        { name: 'Class A/F directors (Founder LLC controls)', members: [{ name: 'Dario Amodei' }, { name: 'Daniela Amodei (Chair)' }, { name: 'Third Class A/F director' }], cohesion: C('bloc') },
        { name: 'LTBT Trustees', count: 5, memberPrefix: 'Trustee', cohesion: C('bloc') },
        { name: 'All directors', members: [{ ref: 'Reed Hastings' }, { ref: 'Vas Narasimhan' }, { ref: 'Chris Liddell' }, { ref: 'Class T director #4' }, { ref: 'Dario Amodei' }, { ref: 'Daniela Amodei (Chair)' }, { ref: 'Third Class A/F director' }], cohesion: C('independent') },
      ],
      [
        { name: 'Ordinary board resolution (Trustees have no vote)', conditions: [{ scope: 'All directors', op: 'count', value: 4 }] },
        { name: 'Trust Amendment Threshold (6 of 7 directors + 4 of 5 Trustees)', conditions: [{ scope: 'All directors', op: 'count', value: 6 }, { scope: 'LTBT Trustees', op: 'ge', value: 80 }] },
      ],
      { overlapMode: 'first' }
    ),

    anthropicStock: () => build(
      'Anthropic stockholders (general matters)',
      'Votes on matters put to stockholders generally (e.g. electing the three non-Class T directors). The single Class F share, held by the Founder LLC and voted as a majority of the seven co-founders directs, carries 50.1% of total voting power; public Class A holds the rest (one vote per share). Each co-founder is shown with 50.1/7 of the Class F vote so that the LLC\'s internal cohesion can be varied.',
      [
        { name: 'Founder LLC (Class F share)', members: ['Dario Amodei', 'Daniela Amodei', 'Tom Brown', 'Jack Clark', 'Jared Kaplan', 'Sam McCandlish', 'Christopher Olah'].map((n) => ({ name: n, weight: 50.1 / 7 })), cohesion: C('bloc') },
        { name: 'Class A (public & other holders)', members: [{ name: 'Class A holders', weight: 49.9 }], cohesion: C('bloc') },
      ],
      [{ name: 'General stockholder vote (> 50% of votes)', conditions: [{ scope: 'all', op: 'gt', value: 50 }] }]
    ),

    blank: () => build('Custom board', 'Start from scratch: add members, coalitions and rules.', [
      { name: 'Faction A', count: 3 },
      { name: 'Faction B', count: 2 },
      { name: 'Faction C', count: 1 },
    ], [{ name: 'Simple majority', conditions: [{ scope: 'all', op: 'gt', value: 50 }] }]),
  };

  const list = [
    ['assignment', 'Assignment: university council'],
    ['sao', 'Class example: IIMA SAO'],
    ['tata2026', 'Tata Sons board (Sept 2026)'],
    ['tata2025', 'Tata Sons board (3 nominees, illustrative)'],
    ['tataShareholders', 'Tata Sons shareholders'],
    ['anthropicBoard', 'Anthropic board (post-IPO)'],
    ['anthropicVacancy', 'Anthropic board (Class T vacancy)'],
    ['anthropicTrust', 'Anthropic: amending the LTBT'],
    ['anthropicStock', 'Anthropic stockholders'],
    ['blank', 'Custom (blank)'],
  ];
  return { presets, list };
});
