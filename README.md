# Board Power Lab: Shapley-Shubik calculator

A static web app that computes **Shapley-Shubik power** for boards made of factions. It handles:

- **Members with weights** (seats, votes or % of shares), and **coalitions that can overlap**.
- **Rules inside a coalition**: everyone votes together; everyone votes independently; the coalition splits into *k* sub-factions (or explicit sizes like `2,1,1`); a core of *N* members votes together; the whole coalition votes together with probability *p*; or each member follows the bloc with probability *p*.
- **Multi-condition decision rules**, e.g. overall majority **and** a majority of Faculty. This covers concurrent majorities, affirmative-vote clauses (Tata Sons Art. 121), Whole-Board thresholds with vacancies, and multi-body supermajorities (Anthropic's Trust Amendment Threshold).
- **Charts** of each coalition's power against its internal strength: probability *p* of voting together, and number of sub-factions. For one rule or averaged over all rules.
- **Excel download** with every step: inputs, summary, every subset with `FACT()` weights and swings (`SUMPRODUCT`), every voting order with its pivot (`COUNTIF/n!`), probability scenarios, and the sweep data behind the charts.
- **Case studies**: the assignment's university council, **Tata Sons / Tata Trusts** (Articles 104B & 121, the September 2026 dispute), and **Anthropic's S-1** (Long-Term Benefit Trust, Class T directors, Founder LLC).

## Run locally

No build step. Open `index.html` or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Method

φᵢ = Σ over S ⊆ N∖{i} of |S|!(n−|S|−1)!/n! · [v(S∪{i}) − v(S)]

A *player* is a group of members that votes together. Its power is split among its members by weight, and a coalition's power is the sum over its members. Probabilistic cohesion is handled by enumerating every voting structure and taking the probability-weighted expectation. The index is computed exactly for up to 20 voting blocs, and by Monte Carlo above that.

Check: the class IIMA SAO example (PGP 4, PhD 2, ePGP 2, Director 1; 5 of 9 to pass) gives PGP = 0.5 and 1/6 for each of the others.

## Files

- `index.html`: the app (Calculator, Power vs cohesion, Case studies, Method)
- `js/engine.js`: Shapley-Shubik engine (also runs in Node: `require('./js/engine.js')`)
- `js/presets.js`: preset boards
- `js/excel.js`: workbook export
- `js/cases.js`: live case-study tables and charts
- `vendor/`: Chart.js (MIT) and SheetJS Community Edition (Apache 2.0)
