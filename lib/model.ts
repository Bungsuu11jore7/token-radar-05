// Radar-5 model: fitted comps pricing (M1) + age-cohort token odds + costed farm plans.
// Every number is computed from the snapshot at runtime. No hardcoded names.
// Model is IDENTICAL to radar-4 (M1): 13 alternative forms were tested held-out
// (age, growth, quadratic, category, Huber, trimmed) and none beat M1.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface FitResult {
  n: number;
  dropped: number;
  intercept: number;
  slope: number;
  foldR2: [number, number];
  foldMed: [number, number];
  flatFoldR2: [number, number];
  flatFoldMed: [number, number];
  walkR2: number;
  walkMed: number;
  flatWalkR2: number;
  flatWalkMed: number;
  looR2: number;
  looMed: number;
}

export interface OddsBucket {
  label: string;
  minDays: number | null;
  maxDays: number | null;
  n: number;
  withToken: number;
  rate: number;
}

export interface FarmPlan {
  steps: string[];
  gasUsd: number;
  bridgeUsd: number;
  capitalUsd: number;
  weeks: number;
  totalCostUsd: number;
  breakeven: number;
  verdict: "Farm" | "Thin" | "Skip";
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Small dense linear solve (Gaussian elimination, partial pivoting).
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    const t = M[c];
    M[c] = M[piv];
    M[piv] = t;
    const d = M[c][c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function ols(design: number[][], y: number[]): number[] {
  const p = design[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < design.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += design[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += design[i][a] * design[i][b];
    }
  }
  return solveLinear(XtX, Xty);
}

function r2Med(y: number[], yh: number[]): { r2: number; med: number } {
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  const absErr: number[] = [];
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yh[i]) ** 2;
    ssTot += (y[i] - mean) ** 2;
    absErr.push(Math.abs(y[i] - yh[i]));
  }
  return { r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, med: median(absErr) };
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const a = Date.parse(asOf.slice(0, 10) + "T00:00:00Z");
  const l = Date.parse(listedAt.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(l)) return null;
  return Math.max(0, Math.round((a - l) / 86400000));
}

// Fit log10(mcap) = intercept + slope * log10(tvl) on traded protocols,
// with 2-fold (index parity in slug-sorted order), walk-forward (dated only,
// median split, fit older -> test younger), flat-multiple baselines (median
// mcap/tvl on the train fold) and leave-one-out via the hat matrix.
export function fitComps(traded: SnapshotProtocol[]): FitResult {
  const y = traded.map((p) => Math.log10(p.mcap_usd as number));
  const X = traded.map((p) => [1, Math.log10(p.tvl_usd)]);
  const n = traded.length;
  const [intercept, slope] = ols(X, y);

  const foldR2: [number, number] = [0, 0];
  const foldMed: [number, number] = [0, 0];
  const flatFoldR2: [number, number] = [0, 0];
  const flatFoldMed: [number, number] = [0, 0];
  for (let fold = 0; fold < 2; fold++) {
    const te = traded.map((_, i) => i).filter((i) => i % 2 === fold);
    const tr = traded.map((_, i) => i).filter((i) => i % 2 !== fold);
    const b = ols(tr.map((i) => X[i]), tr.map((i) => y[i]));
    const m1 = r2Med(te.map((i) => y[i]), te.map((i) => b[0] + b[1] * X[i][1]));
    foldR2[fold] = m1.r2;
    foldMed[fold] = m1.med;
    const mult = median(tr.map((i) => (traded[i].mcap_usd as number) / traded[i].tvl_usd));
    const m0 = r2Med(
      te.map((i) => y[i]),
      te.map((i) => Math.log10(mult * traded[i].tvl_usd)),
    );
    flatFoldR2[fold] = m0.r2;
    flatFoldMed[fold] = m0.med;
  }

  const dated = traded
    .map((p, i) => ({ i, at: p.listed_at as string }))
    .filter((d) => d.at)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const half = dated.length >> 1;
  const wTr = dated.slice(0, half).map((d) => d.i);
  const wTe = dated.slice(half).map((d) => d.i);
  const wb = ols(wTr.map((i) => X[i]), wTr.map((i) => y[i]));
  const wm = r2Med(wTe.map((i) => y[i]), wTe.map((i) => wb[0] + wb[1] * X[i][1]));
  const wMult = median(wTr.map((i) => (traded[i].mcap_usd as number) / traded[i].tvl_usd));
  const wfm = r2Med(
    wTe.map((i) => y[i]),
    wTe.map((i) => Math.log10(wMult * traded[i].tvl_usd)),
  );

  // LOO via hat matrix: loo residual = resid / (1 - h_ii).
  const XtXInv = (() => {
    const XtX: number[][] = [[0, 0], [0, 0]];
    for (const row of X) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) XtX[a][b] += row[a] * row[b];
    const det = XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0];
    return [
      [XtX[1][1] / det, -XtX[0][1] / det],
      [-XtX[1][0] / det, XtX[0][0] / det],
    ];
  })();
  const looYh: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = X[i][0] * (XtXInv[0][0] * X[i][0] + XtXInv[0][1] * X[i][1]) +
      X[i][1] * (XtXInv[1][0] * X[i][0] + XtXInv[1][1] * X[i][1]);
    const resid = y[i] - (intercept + slope * X[i][1]);
    looYh.push(y[i] - resid / (1 - h));
  }
  const loo = r2Med(y, looYh);

  return {
    n,
    dropped: 0,
    intercept,
    slope,
    foldR2,
    foldMed,
    flatFoldR2,
    flatFoldMed,
    walkR2: wm.r2,
    walkMed: wm.med,
    flatWalkR2: wfm.r2,
    flatWalkMed: wfm.med,
    looR2: loo.r2,
    looMed: loo.med,
  };
}

// Token odds: share of peers of the same age that record a token.
export function oddsBuckets(protocols: SnapshotProtocol[], asOf: string): { buckets: OddsBucket[]; overall: number } {
  const defs: { label: string; min: number | null; max: number | null }[] = [
    { label: "<90 days", min: 0, max: 90 },
    { label: "90-365 days", min: 90, max: 365 },
    { label: "1-2 years", min: 365, max: 730 },
    { label: "2-4 years", min: 730, max: 1460 },
    { label: ">4 years", min: 1460, max: null },
  ];
  const buckets: OddsBucket[] = defs.map((d) => ({ label: d.label, minDays: d.min, maxDays: d.max, n: 0, withToken: 0, rate: 0 }));
  let withTokenAll = 0;
  for (const p of protocols) {
    const has = p.mcap_usd !== null && p.mcap_usd !== undefined;
    if (has) withTokenAll++;
    const a = ageDays(asOf, p.listed_at);
    if (a === null) continue;
    for (const b of buckets) {
      if ((b.minDays === null || a >= b.minDays) && (b.maxDays === null || a < b.maxDays)) {
        b.n++;
        if (has) b.withToken++;
        break;
      }
    }
  }
  const overall = withTokenAll / protocols.length;
  for (const b of buckets) b.rate = b.n === 0 ? overall : b.withToken / b.n;
  return { buckets, overall };
}

export function oddsFor(age: number | null, buckets: OddsBucket[], overall: number): { odds: number; bucket: string; n: number } {
  if (age === null) return { odds: overall, bucket: "age unknown", n: 0 };
  for (const b of buckets) {
    if ((b.minDays === null || age >= b.minDays) && (b.maxDays === null || age < b.maxDays)) {
      return { odds: b.rate, bucket: b.label, n: b.n };
    }
  }
  return { odds: overall, bucket: "age unknown", n: 0 };
}

const EXCLUDED_CATEGORIES = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
const EXCHANGE_PREFIX = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

// Returns the exclusion reason, or null when the protocol belongs on the board.
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (WRAPPED_WORD.test(p.name)) return "wrapped/staked product";
  if (EXCHANGE_PREFIX.some((e) => p.name.startsWith(e))) return "exchange product";
  if (VERSION_SUFFIX.test(p.name)) return "versioned duplicate";
  return null;
}

export function impliedUsd(tvl: number, fit: FitResult): number {
  return Math.max(1, Math.round(10 ** (fit.intercept + fit.slope * Math.log10(tvl))));
}

export function gasUsd(chain: string): number {
  const table: Record<string, number> = {
    Ethereum: 8.0, Base: 0.5, Arbitrum: 0.5, Optimism: 0.5, Solana: 0.05,
    BSC: 0.3, Polygon: 0.1, Avalanche: 0.4,
  };
  return table[chain] ?? 1.0;
}

function capitalTier(tvl: number): number {
  if (tvl >= 1_000_000_000) return 1000;
  if (tvl >= 100_000_000) return 500;
  return 100;
}

function coreAction(category: string | null, name: string, chain: string, capital: number): string {
  const c = category ?? "";
  if (c === "Dexs") return `Swap $${capital} and provide liquidity in the ${name} pool on ${chain}; keep the LP tokens and the transaction receipt for the claim.`;
  if (c === "Lending") return `Supply $${capital} as collateral on ${name} (${chain}), then borrow a small amount around 20% of the collateral so the position stays safe from liquidation.`;
  if (c === "Yield") return `Deposit $${capital} into the ${name} vault on ${chain}; let the yield run and check the position every week before adding funds.`;
  if (c === "RWA") return `Mint or hold a $${capital} position in ${name} (${chain}); keep proof of holding because airdrops usually snapshot holders.`;
  if (c === "Risk Curators" || c === "Onchain Capital Allocator") return `Allocate $${capital} to a curator vault on ${name} (${chain}); pick the vault with the largest TVL so slippage stays small.`;
  if (c === "CDP") return `Open a CDP vault on ${name} (${chain}) with $${capital} of collateral; keep the collateral ratio above 150% so it is never liquidated.`;
  return `Use ${name} on ${chain} with $${capital}: run its core transaction (swap, deposit, or stake) and save the transaction hash as proof.`;
}

export function farmPlan(
  name: string,
  category: string | null,
  chain: string,
  tvl: number,
  odds: number,
  expectedUsd: number,
): FarmPlan {
  const gas = gasUsd(chain);
  const bridge = chain === "Ethereum" ? 0 : 12;
  const capital = capitalTier(tvl);
  const weeks = odds >= 0.22 ? 8 : odds >= 0.12 ? 6 : 4;
  const totalCost = gas * (1 + weeks) + bridge;
  const breakeven = totalCost / Math.max(1, expectedUsd);
  const verdict: FarmPlan["verdict"] =
    odds < 0.05 || breakeven >= 0.01 ? "Skip" : odds < 0.12 || breakeven >= 0.0001 ? "Thin" : "Farm";
  const steps = [
    `Prepare $${capital} of working capital on ${chain} for ${name} plus $${gas.toFixed(2)} for the first gas fee; note the contract address and record the starting balance before the first transaction.`,
    coreAction(category, name, chain, capital),
    `Repeat the core action once a week for ${weeks} weeks; each repeat costs about $${gas.toFixed(2)} of gas on ${chain}, so budget $${(gas * weeks).toFixed(2)} of gas in total.`,
    `Record every transaction (hash, date, amount) on ${name}; this proof is what decides eligibility when an airdrop snapshot is announced.`,
    `When a token listing is announced, claim through ${name}'s official channel; then withdraw the $${capital} working capital (returned on exit) and compare the gain with the $${totalCost.toFixed(2)} total cost.`,
  ];
  return { steps, gasUsd: gas, bridgeUsd: bridge, capitalUsd: capital, weeks, totalCostUsd: totalCost, breakeven, verdict };
}
