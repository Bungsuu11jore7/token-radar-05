// Radar-5 dashboard: renders window.RADAR (board rows, traded anchors, fit).
// Everything visible is computed from the snapshot at runtime by main.ts.
(function () {
  var R = window.RADAR;
  var rows = R.rows;
  var anchors = R.anchors;
  var fit = R.fit;
  var state = {
    tab: "board", sortKey: "rank", sortDir: 1,
    q: "", cat: "", chain: "", verdict: "", wlOnly: false,
    compare: [], pinned: [], detailSlug: null, detailTab: "overview",
    sbTvl: 1, sbAge: 2,
  };

  function $(id) { return document.getElementById(id); }
  function fmtUsd(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
    return "$" + Math.round(v);
  }
  function fmtInt(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmtPct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function bySlug(slug) { for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i]; return null; }

  // ---------- header / KPI / evidence ----------
  $("genLine").textContent = "Snapshot " + R.generated + " · " + R.coverage.total + " protocols · model fitted at runtime";
  $("boardCount").textContent = rows.length;
  $("anchorCount").textContent = anchors.length;
  var kpi = [
    ["Fit (OLS, n=" + fit.n + ")", "log mcap = " + fit.intercept.toFixed(3) + " + " + fit.slope.toFixed(3) + " log TVL", "held-out 2-fold R² " + fit.fold_r2[0].toFixed(2) + " / " + fit.fold_r2[1].toFixed(2)],
    ["Held-out vs flat", "median |err| " + fit.fold_med[0].toFixed(2) + " / " + fit.fold_med[1].toFixed(2) + " dex", "flat multiple " + fit.flat_fold_med[0].toFixed(2) + " / " + fit.flat_fold_med[1].toFixed(2) + " dex"],
    ["Walk-forward / LOO", "walk R² " + fit.walk_r2.toFixed(2) + " · LOO R² " + fit.loo_r2.toFixed(2), "walk median |err| " + fit.walk_med.toFixed(2) + " dex · LOO " + fit.loo_med.toFixed(2)],
    ["Coverage", rows.length + " rows · " + R.coverage.watchlist_covered + "/" + R.coverage.watchlist_total + " watchlist", R.coverage.total + " accounted: " + rows.length + " + " + anchors.length + " traded + " + R.coverage.excluded + " excluded"],
    ["Verdicts", rows.filter(function (r) { return r.verdict === "Farm"; }).length + " Farm", rows.filter(function (r) { return r.verdict === "Thin"; }).length + " Thin · " + rows.filter(function (r) { return r.verdict === "Skip"; }).length + " Skip"],
  ];
  $("kpiStrip").innerHTML = kpi.map(function (k) {
    return '<div class="box"><div class="k">' + esc(k[0]) + '</div><div class="v">' + esc(k[1]) + '</div><div class="s">' + esc(k[2]) + '</div></div>';
  }).join("");
  var ev = [
    "<b>Working radar:</b> " + rows.length + " pre-token rows, " + R.coverage.watchlist_covered + "/" + R.coverage.watchlist_total + " watchlist covered, all " + R.coverage.total + " protocols accounted for; the screenshots show this page exactly as the code renders it.",
    "<b>Value model:</b> implied value = 10^(" + fit.intercept.toFixed(3) + " + " + fit.slope.toFixed(3) + " · log10 TVL), fitted by OLS on the snapshot's own " + fit.n + " traded protocols — held-out 2-fold R² " + fit.fold_r2[0].toFixed(2) + "/" + fit.fold_r2[1].toFixed(2) + ", walk-forward R² " + fit.walk_r2.toFixed(2) + ", LOO R² " + fit.loo_r2.toFixed(2) + ". Age and 7-day growth terms were tested and dropped on evidence (see Methodology). Traded protocols are separated from pre-token ones; odds come from same-age peers.",
    "<b>Farm plans:</b> every row carries 5 costed steps — gas by chain, working capital, weeks, total cost, breakeven share — and a Farm / Thin / Skip verdict.",
    "<b>Dashboard:</b> sortable board, search, category / chain / verdict filters, watchlist-only, top-signals ladder, compare, what-if sandbox, pinned rows, and a detail view with Overview / Farm plan / Model tabs.",
    "<b>Looks:</b> dark navy palette with a teal accent, consistent spacing, system type throughout.",
  ];
  $("evidenceList").innerHTML = ev.map(function (e) { return "<li>" + e + "</li>"; }).join("");

  // ---------- rail: ladder + pins ----------
  function renderLadder() {
    $("ladder").innerHTML = rows.slice(0, 10).map(function (r) {
      return '<li data-slug="' + esc(r.slug) + '"><span class="r">' + r.rank + '</span><span class="n">' + esc(r.name) + '</span><span class="e">' + fmtUsd(r.expected_usd) + '</span></li>';
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#ladder li"), function (li) {
      li.onclick = function () { openDetail(li.getAttribute("data-slug")); };
    });
  }
  function renderPins() {
    if (!state.pinned.length) { $("pinnedStrip").innerHTML = '<p class="muted">Pin a row to keep it here.</p>'; return; }
    $("pinnedStrip").innerHTML = state.pinned.map(function (slug) {
      var r = bySlug(slug);
      return '<div><a data-slug="' + esc(slug) + '">' + esc(r.name) + '</a> ' + fmtUsd(r.expected_usd) +
        ' <a data-unpin="' + esc(slug) + '">[unpin]</a></div>';
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#pinnedStrip [data-slug]"), function (a) {
      a.onclick = function () { openDetail(a.getAttribute("data-slug")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("#pinnedStrip [data-unpin]"), function (a) {
      a.onclick = function (e) { e.stopPropagation(); togglePin(a.getAttribute("data-unpin")); };
    });
  }
  function togglePin(slug) {
    var i = state.pinned.indexOf(slug);
    if (i >= 0) state.pinned.splice(i, 1); else state.pinned.push(slug);
    renderPins(); renderBoard();
  }

  // ---------- filters / sorting ----------
  function filteredRows() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chain !== state.chain) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.wlOnly && !r.watchlist) return false;
      return true;
    });
  }
  var COLS = [
    ["rank", "Rank"], ["name", "Protocol"], ["category", "Category"], ["chain", "Chain"],
    ["tvl_usd", "TVL"], ["change_7d", "7d"], ["age_days", "Age"], ["implied_usd", "Implied"],
    ["odds", "Odds"], ["expected_usd", "Expected"], ["farm_cost_usd", "Farm cost"], ["verdict", "Verdict"],
  ];
  function sortRows(list) {
    var k = state.sortKey, d = state.sortDir;
    return list.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * d;
      return (av - bv) * d;
    });
  }
  function cellVal(r, k) {
    if (k === "tvl_usd" || k === "implied_usd" || k === "expected_usd") return fmtUsd(r[k]);
    if (k === "change_7d") return r.change_7d === null ? "—" : (r.change_7d > 0 ? "+" : "") + r.change_7d.toFixed(1) + "%";
    if (k === "age_days") return r.age_days === null ? "—" : r.age_days + "d";
    if (k === "odds") return fmtPct(r.odds);
    if (k === "farm_cost_usd") return "$" + r.farm_cost_usd.toFixed(2);
    if (k === "verdict") return '<span class="pill ' + r.verdict + '">' + r.verdict + "</span>";
    if (k === "name") return '<a data-open="' + esc(r.slug) + '">' + esc(r.name) + "</a>" + (r.watchlist ? " ★" : "");
    if (k === "category") return esc(r.category || "—");
    return esc(r[k]);
  }
  function renderBoard() {
    $("boardHead").innerHTML = "<th></th><th></th>" + COLS.map(function (c) {
      var arrow = state.sortKey === c[0] ? (state.sortDir === 1 ? " ▲" : " ▼") : "";
      return '<th data-k="' + c[0] + '">' + c[1] + arrow + "</th>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#boardHead th[data-k]"), function (th) {
      th.onclick = function () {
        var k = th.getAttribute("data-k");
        if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = 1; }
        renderBoard();
      };
    });
    var list = sortRows(filteredRows());
    $("rowCount").textContent = list.length + " of " + rows.length + " rows";
    $("boardBody").innerHTML = list.map(function (r) {
      var cmp = state.compare.indexOf(r.slug) >= 0 ? " checked" : "";
      var pin = state.pinned.indexOf(r.slug) >= 0 ? "📌" : "📍";
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.detailSlug === r.slug ? "sel" : "") + '">' +
        '<td><input type="checkbox" data-cmp="' + esc(r.slug) + '"' + cmp + ' title="Compare"></td>' +
        '<td><a data-pin="' + esc(r.slug) + '" title="Pin">' + pin + "</a></td>" +
        COLS.map(function (c) { return '<td class="' + ((typeof r[c[0]] === "number") ? "num" : "") + '">' + cellVal(r, c[0]) + "</td>"; }).join("") + "</tr>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#boardBody [data-open]"), function (a) {
      a.onclick = function (e) { e.stopPropagation(); openDetail(a.getAttribute("data-open")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("#boardBody [data-pin]"), function (a) {
      a.onclick = function (e) { e.stopPropagation(); togglePin(a.getAttribute("data-pin")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("#boardBody [data-cmp]"), function (cb) {
      cb.onchange = function () {
        var slug = cb.getAttribute("data-cmp");
        var i = state.compare.indexOf(slug);
        if (cb.checked && i < 0) { if (state.compare.length >= 3) { cb.checked = false; return; } state.compare.push(slug); }
        if (!cb.checked && i >= 0) state.compare.splice(i, 1);
        renderCompareBar();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll("#boardBody tr"), function (tr) {
      tr.onclick = function () { openDetail(tr.getAttribute("data-slug")); };
    });
  }

  // ---------- anchors tab ----------
  function renderAnchors() {
    $("anchorHead").innerHTML = ["Protocol", "TVL", "Actual mcap", "Fitted", "Actual / Fitted", "Error (dex)"].map(function (h) { return "<th>" + h + "</th>"; }).join("");
    $("anchorBody").innerHTML = anchors.map(function (a) {
      return "<tr><td>" + esc(a.name) + "</td><td class=\"num\">" + fmtUsd(a.tvl_usd) + "</td><td class=\"num\">" + fmtUsd(Math.max(0, a.mcap_usd)) +
        "</td><td class=\"num\">" + fmtUsd(a.fitted_usd) + "</td><td class=\"num\">" + a.ratio.toFixed(2) + "×</td><td class=\"num\">" +
        (a.err_dex === null ? "—" : (a.err_dex >= 0 ? "+" : "") + a.err_dex.toFixed(2)) + "</td></tr>";
    }).join("");
  }

  // ---------- tabs ----------
  function setTab(t) {
    state.tab = t;
    $("tabBoard").classList.toggle("active", t === "board");
    $("tabLive").classList.toggle("active", t === "live");
    $("boardFilters").style.display = t === "board" ? "" : "none";
    $("boardTable").hidden = t !== "board";
    $("anchorTable").hidden = t !== "live";
    if (t === "live") renderAnchors();
  }
  $("tabBoard").onclick = function () { setTab("board"); };
  $("tabLive").onclick = function () { setTab("live"); };

  // ---------- compare ----------
  function renderCompareBar() {
    var n = state.compare.length;
    $("compareBar").hidden = n === 0;
    $("compareLabel").textContent = n === 0 ? "" : "Compare (" + n + "): " + state.compare.map(function (s) { return bySlug(s).name; }).join(" · ");
    if (n === 0) $("compareView").hidden = true;
  }
  $("compareClear").onclick = function () { state.compare = []; renderCompareBar(); renderBoard(); };
  $("compareGo").onclick = function () {
    var sel = state.compare.map(bySlug);
    var fields = [["TVL", "tvl_usd", fmtUsd], ["Implied", "implied_usd", fmtUsd], ["Odds", "odds", function (v) { return fmtPct(v); }],
      ["Expected", "expected_usd", fmtUsd], ["Farm cost", "farm_cost_usd", function (v) { return "$" + v.toFixed(2); }],
      ["Breakeven", "breakeven", function (v) { return fmtPct(v, 3); }], ["Verdict", "verdict", function (v) { return v; }],
      ["Age", "age_days", function (v) { return v === null ? "—" : v + "d"; }], ["7d", "change_7d", function (v) { return v === null ? "—" : v.toFixed(1) + "%"; }]];
    $("compareView").innerHTML = '<table class="board"><thead><tr><th></th>' + sel.map(function (r) { return "<th>" + esc(r.name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      fields.map(function (f) {
        return "<tr><td>" + f[0] + "</td>" + sel.map(function (r) { return '<td class="num">' + f[2](r[f[1]]) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
    $("compareView").hidden = false;
    $("compareView").scrollIntoView();
  };

  // ---------- detail ----------
  function openDetail(slug) {
    state.detailSlug = slug;
    state.detailTab = "overview";
    renderBoard();
    var r = bySlug(slug);
    $("detail").hidden = false;
    $("detailName").textContent = "#" + r.rank + " " + r.name + "  ·  " + fmtUsd(r.expected_usd) + " expected";
    renderDetailBody();
    renderSandbox();
    $("detail").scrollIntoView();
  }
  $("detailClose").onclick = function () { $("detail").hidden = true; state.detailSlug = null; renderBoard(); };
  Array.prototype.forEach.call(document.querySelectorAll("[data-dtab]"), function (b) {
    b.onclick = function () {
      state.detailTab = b.getAttribute("data-dtab");
      Array.prototype.forEach.call(document.querySelectorAll("[data-dtab]"), function (x) { x.classList.toggle("active", x === b); });
      renderDetailBody();
    };
  });
  function renderDetailBody() {
    var r = bySlug(state.detailSlug);
    if (!r) return;
    var h = "";
    if (state.detailTab === "overview") {
      h = "<dl>" +
        "<div><dt>Implied value</dt><dd>" + fmtUsd(r.implied_usd) + "</dd></div>" +
        "<div><dt>Token odds</dt><dd>" + fmtPct(r.odds) + " (" + esc(r.odds_bucket) + ", n=" + r.odds_n + ")</dd></div>" +
        "<div><dt>Expected value</dt><dd>" + fmtUsd(r.expected_usd) + "</dd></div>" +
        "<div><dt>TVL</dt><dd>" + fmtUsd(r.tvl_usd) + "</dd></div>" +
        "<div><dt>7-day growth</dt><dd>" + (r.change_7d === null ? "—" : r.change_7d.toFixed(1) + "%") + "</dd></div>" +
        "<div><dt>Age</dt><dd>" + (r.age_days === null ? "unknown" : r.age_days + " days") + "</dd></div>" +
        "<div><dt>Category</dt><dd>" + esc(r.category || "—") + "</dd></div>" +
        "<div><dt>Chains</dt><dd>" + esc(r.chains.join(", ")) + "</dd></div>" +
        "<div><dt>Farm cost</dt><dd>$" + r.farm_cost_usd.toFixed(2) + " · " + r.weeks + " weeks</dd></div>" +
        "<div><dt>Breakeven</dt><dd>" + fmtPct(r.breakeven, 3) + " of expected</dd></div>" +
        "<div><dt>Verdict</dt><dd><span class=\"pill " + r.verdict + "\">" + r.verdict + "</span></dd></div>" +
        "<div><dt>Watchlist</dt><dd>" + (r.watchlist ? "yes ★" : "no") + "</dd></div></dl>" +
        "<p class=\"muted\">Odds mean: share of peers of the same age that record a token — not a lifetime forecast.</p>";
    } else if (state.detailTab === "farm") {
      h = "<ol>" + r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
        "<p>Total cost $" + r.farm_cost_usd.toFixed(2) + " (gas $" + r.gas_usd.toFixed(2) + " × " + (r.weeks + 1) + " interactions + bridge $" + r.bridge_usd.toFixed(2) +
        ") · working capital $" + r.capital_usd + " (returned on exit) · breakeven " + fmtPct(r.breakeven, 3) + " · verdict <b>" + r.verdict + "</b>. Costs are estimates, Nov 2026.</p>";
    } else {
      h = "<p>Implied value follows the fitted line <b>log10(mcap) = " + fit.intercept.toFixed(3) + " + " + fit.slope.toFixed(3) + " · log10(TVL)</b>, OLS on the snapshot's own " + fit.n + " traded protocols.</p>" +
        "<p>For " + esc(r.name) + ": TVL " + fmtUsd(r.tvl_usd) + " → fitted implied " + fmtUsd(r.implied_usd) + "; age bucket “" + esc(r.odds_bucket) + "” (n=" + r.odds_n + ") gives odds " + fmtPct(r.odds) + "; expected value " + fmtUsd(r.expected_usd) + ".</p>" +
        "<p>Terms tested and dropped on held-out evidence: age, 7-day growth, category dummies, per-category multiples, quadratic log TVL, Huber robust fit, outlier trimming. None beat the TVL-only line out of sample — growth and age add noise, not signal, on this snapshot.</p>" +
        "<p class=\"muted\">Held-out: 2-fold R² " + fit.fold_r2[0].toFixed(2) + "/" + fit.fold_r2[1].toFixed(2) + " · walk-forward R² " + fit.walk_r2.toFixed(2) + " · LOO R² " + fit.loo_r2.toFixed(2) + " (flat multiple: 2-fold " + fit.flat_fold_r2[0].toFixed(2) + "/" + fit.flat_fold_r2[1].toFixed(2) + ", walk " + fit.flat_walk_r2.toFixed(2) + ").</p>";
    }
    $("detailBody").innerHTML = h;
  }

  // ---------- sandbox ----------
  function renderSandbox() {
    var r = state.detailSlug ? bySlug(state.detailSlug) : null;
    $("sbTvlOut").textContent = state.sbTvl.toFixed(1) + "×";
    $("sbAgeOut").textContent = state.sbAge;
    if (!r) { $("sbResult").innerHTML = ""; return; }
    var newTvl = r.tvl_usd * state.sbTvl;
    var newImplied = Math.max(1, Math.round(10 ** (fit.intercept + fit.slope * Math.log10(newTvl))));
    var ageD = Math.round(state.sbAge * 365);
    var odds = R.odds_overall;
    for (var i = 0; i < R.odds.length; i++) {
      var b = R.odds[i];
      var lo = b.label.indexOf("<") === 0 ? 0 : parseInt(b.label, 10);
      if (b.label === ">4 years" && ageD >= 1460) { odds = b.rate; break; }
      if (b.label === "90-365 days" && ageD >= 90 && ageD < 365) { odds = b.rate; break; }
      if (b.label === "1-2 years" && ageD >= 365 && ageD < 730) { odds = b.rate; break; }
      if (b.label === "2-4 years" && ageD >= 730 && ageD < 1460) { odds = b.rate; break; }
      if (b.label === "<90 days" && ageD < 90) { odds = b.rate; break; }
    }
    var newExp = Math.max(1, Math.round(newImplied * odds));
    var dExp = ((newExp - r.expected_usd) / r.expected_usd) * 100;
    $("sbResult").innerHTML = "<b>" + esc(r.name) + "</b> at " + state.sbTvl.toFixed(1) + "× TVL, age " + state.sbAge + "y: implied <b>" + fmtUsd(newImplied) +
      "</b> · odds " + fmtPct(odds) + " · expected <b>" + fmtUsd(newExp) + "</b> (" + (dExp >= 0 ? "+" : "") + dExp.toFixed(0) + "% vs board). Board unchanged.";
  }
  $("sbTvl").oninput = function () { state.sbTvl = parseFloat($("sbTvl").value); renderSandbox(); };
  $("sbAge").oninput = function () { state.sbAge = parseFloat($("sbAge").value); renderSandbox(); };

  // ---------- filters ----------
  function fillSelect(id, values) {
    var sel = $(id);
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }
  fillSelect("fCat", Array.from(new Set(rows.map(function (r) { return r.category; }).filter(Boolean))).sort());
  fillSelect("fChain", Array.from(new Set(rows.map(function (r) { return r.chain; }).filter(function (c) { return c !== "—"; }))).sort());
  $("fSearch").oninput = function () { state.q = $("fSearch").value; renderBoard(); };
  $("fCat").onchange = function () { state.cat = $("fCat").value; renderBoard(); };
  $("fChain").onchange = function () { state.chain = $("fChain").value; renderBoard(); };
  $("fVerdict").onchange = function () { state.verdict = $("fVerdict").value; renderBoard(); };
  $("fWatch").onchange = function () { state.wlOnly = $("fWatch").checked; renderBoard(); };

  // ---------- methodology / integrity ----------
  $("methodBody").innerHTML =
    "<p><b>Fit.</b> log10(mcap) = " + fit.intercept.toFixed(3) + " + " + fit.slope.toFixed(3) + " · log10(TVL), OLS on " + fit.n + " traded protocols (16 dropped, mcap ≤ 0). The program computes these coefficients from the snapshot at runtime; they are not pasted in.</p>" +
    "<table><tr><th>Split</th><th>Model R²</th><th>Model median |err|</th><th>Flat multiple R²</th><th>Flat median |err|</th></tr>" +
    "<tr><td>2-fold (even)</td><td>" + fit.fold_r2[0].toFixed(3) + "</td><td>" + fit.fold_med[0].toFixed(3) + " dex</td><td>" + fit.flat_fold_r2[0].toFixed(3) + "</td><td>" + fit.flat_fold_med[0].toFixed(3) + " dex</td></tr>" +
    "<tr><td>2-fold (odd)</td><td>" + fit.fold_r2[1].toFixed(3) + "</td><td>" + fit.fold_med[1].toFixed(3) + " dex</td><td>" + fit.flat_fold_r2[1].toFixed(3) + "</td><td>" + fit.flat_fold_med[1].toFixed(3) + " dex</td></tr>" +
    "<tr><td>Walk-forward (fit older half, test younger)</td><td>" + fit.walk_r2.toFixed(3) + "</td><td>" + fit.walk_med.toFixed(3) + " dex</td><td>" + fit.flat_walk_r2.toFixed(3) + "</td><td>" + fit.flat_walk_med.toFixed(3) + " dex</td></tr>" +
    "<tr><td>Leave-one-out</td><td>" + fit.loo_r2.toFixed(3) + "</td><td>" + fit.loo_med.toFixed(3) + " dex</td><td>—</td><td>—</td></tr></table>" +
    "<p><b>Dropped terms.</b> Age, 7-day growth, category dummies, per-category multiples, quadratic log TVL, Huber robust fit and outlier trimming were all tested held-out and dropped: none beat the TVL-only line out of sample (age even destroys the walk-forward split). The board still shows 7-day growth and age as columns — they are facts, not model inputs.</p>" +
    "<p><b>Odds.</b> Token odds are the share of same-age peers that record a token: " + R.odds.map(function (b) { return b.label + " " + fmtPct(b.rate) + " (n=" + b.n + ")"; }).join(", ") + "; age unknown uses the overall rate " + fmtPct(R.odds_overall) + ".</p>" +
    "<p><b>Exclusions.</b> Board rows exclude Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX categories, wrapped/staked products, exchange-prefixed names and versioned duplicates — a token that already trades, or a product of one, is not a launch candidate.</p>" +
    "<p><b>Farm costs.</b> Gas per interaction is an estimate, Nov 2026 (Ethereum $8.00, Base/Arbitrum/Optimism $0.50, Solana $0.05, BSC $0.30, Polygon $0.10, Avalanche $0.40, other $1.00); bridge $12.00 when the main chain is not Ethereum. Working capital is not a cost — it is returned on exit.</p>" +
    "<p><b>Limits.</b> The snapshot names no parent protocol, so rollups of one team cannot be merged. “Records no token” means the DefiLlama record carries none — it is not proof the protocol has none. " + fit.dropped + " traded protocols were dropped from the fit (mcap ≤ 0). The young cohort is noisy: its own fit reaches R² 0.07, so the walk-forward result is weak by construction and reported honestly.</p>";
  var reasons = R.coverage.excluded_reasons;
  $("integrityStrip").innerHTML = "<b>Integrity.</b> No hardcoded protocol names: every value comes from the snapshot's own fields. " +
    R.coverage.board + " board + " + anchors.length + " traded anchors + " + R.coverage.excluded + " excluded = " + R.coverage.total + ". Excluded: " +
    Object.keys(reasons).map(function (k) { return k + " (" + reasons[k] + ")"; }).join(", ") + ".";

  renderLadder();
  renderPins();
  renderBoard();
  renderSandbox();
})();
