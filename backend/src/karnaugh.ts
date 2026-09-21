import type {
  KarnaughGroup,
  KarnaughMapResult,
  Literal,
  SopTerm,
  TruthTable
} from './types.js';
import { formatTerm } from './truthTable.js';

/**
 * 卡诺图化简（Quine–McCluskey 的网格视角实现）。
 *
 * 仅支持 2~4 个输入变量：
 * - 2 变量：行 1（无行变量），列 2（变量 B）
 * - 3 变量：行 2（变量 C），列 4（A B）
 * - 4 变量：行 4（C D），列 4（A B）
 * 行/列内部都按格雷码排列，使几何相邻（含跨首尾边界）的格子恰为逻辑相邻项。
 *
 * 算法步骤：
 * 1. 枚举网格“环面”上所有面积为 2 的幂的全 1 矩形 -> 候选质蕴含项；
 * 2. 去掉被更大候选项包含的 -> 真正的质蕴含项（prime implicant）；
 * 3. 标记本质质蕴含项（essential prime implicant）；
 * 4. 对剩余最小项用分支限界集合覆盖求最简圈法，组数相同取文字数更少者。
 */

const GRAY2 = ['0', '1'];
const GRAY4 = ['00', '01', '11', '10'];

interface AxisLayout {
  size: number;
  varCount: number;
  labels: string[];
  gray: number[][]; // 每个轴位置上各变量的取值位
  /** 轴上第 k 个格雷码位对应的全局变量索引 */
  varIndices: number[];
}

interface RawGroup {
  rows: number[];
  cols: number[];
  minterms: number[];
  literals: Literal[];
  term: string;
}

function axis(size: 2 | 4, varNames: string[], varIndices: number[]): AxisLayout {
  const codes = size === 2 ? GRAY2 : GRAY4;
  return {
    size,
    varCount: size === 2 ? 1 : 2,
    labels: codes,
    gray: codes.map((code) => code.split('').map((c) => Number(c))),
    varIndices
  };
}

/**
 * 在长度为 len（2 或 4）的环上枚举所有连续段（允许跨越首尾边界）。
 * 只保留长度为 2 的幂、且不超过环长的段。
 */
function cyclicSegments(len: number): { start: number; length: number }[] {
  const result: { start: number; length: number }[] = [];
  for (let length = 1; length <= len; length *= 2) {
    for (let start = 0; start < len; start++) {
      result.push({ start, length });
    }
  }
  return result;
}

/** 环上从 start 起连续 length 个位置展开成普通索引；长度 1 的轴只有一个位置 */
function expandSegment(len: number, start: number, length: number): number[] {
  if (len === 1) return [0];
  const out: number[] = [];
  for (let k = 0; k < length; k++) out.push((start + k) % len);
  return out;
}

/** 跨边界的段拆成若干不跨边界的矩形片，供前端直接画框 */
function piecesFor(
  rows: { start: number; length: number },
  cols: { start: number; length: number },
  rowLen: number,
  colLen: number
): KarnaughGroup['pieces'] {
  const rowSegs = splitWrap(rowLen, rows.start, rows.length);
  const colSegs = splitWrap(colLen, cols.start, cols.length);
  const pieces: KarnaughGroup['pieces'] = [];
  for (const r of rowSegs) {
    for (const c of colSegs) {
      pieces.push({ row: r.start, col: c.start, w: c.length, h: r.length });
    }
  }
  return pieces;
}

function splitWrap(
  len: number,
  start: number,
  length: number
): { start: number; length: number }[] {
  if (start + length <= len) return [{ start, length }];
  const head = len - start;
  return [
    { start, length: head },
    { start: 0, length: length - head }
  ];
}

/**
 * 为一个输出构造卡诺图化简结果。
 * 变量顺序与真值表一致（第 0 个变量为最高位）。
 */
export function buildKarnaughMap(
  table: TruthTable,
  outputIndex: number
): KarnaughMapResult {
  const n = table.inputNames.length;
  if (n < 2 || n > 4) {
    throw new Error(`卡诺图只支持 2~4 个输入变量，当前为 ${n} 个`);
  }

  // 变量分配（标准教材画法）：
  // n=2: 列=[A,B]（0,1），无行变量 —— 1×4 单行
  // n=3: 列=[A,B]（0,1）, 行=[C]（2）
  // n=4: 列=[A,B]（0,1）, 行=[C,D]（2,3）
  let colVarNames: string[];
  let rowVarNames: string[];
  let colVarIndices: number[];
  let rowVarIndices: number[];
  if (n === 2) {
    colVarNames = [table.inputNames[0]!, table.inputNames[1]!];
    colVarIndices = [0, 1];
    rowVarNames = [];
    rowVarIndices = [];
  } else if (n === 3) {
    colVarNames = [table.inputNames[0]!, table.inputNames[1]!];
    colVarIndices = [0, 1];
    rowVarNames = [table.inputNames[2]!];
    rowVarIndices = [2];
  } else {
    colVarNames = [table.inputNames[0]!, table.inputNames[1]!];
    colVarIndices = [0, 1];
    rowVarNames = [table.inputNames[2]!, table.inputNames[3]!];
    rowVarIndices = [2, 3];
  }

  const colAxis = axis(4, colVarNames, colVarIndices);
  const rowAxis =
    rowVarNames.length === 0
      ? { size: 1, varCount: 0, labels: [''], gray: [[]] as number[][], varIndices: [] as number[] }
      : axis(rowVarNames.length === 1 ? 2 : 4, rowVarNames, rowVarIndices);

  // 每个轴位置 -> 该位置上变量位的拼接掩码；格坐标 -> 最小项编号
  const cellMinterms: number[][] = [];
  const cellValues: number[][] = [];
  const gridOnes: boolean[][] = [];

  for (let r = 0; r < rowAxis.size; r++) {
    cellMinterms.push([]);
    cellValues.push([]);
    gridOnes.push([]);
    const rowBits = rowAxis.gray[r]!;
    for (let c = 0; c < colAxis.size; c++) {
      const colBits = colAxis.gray[c]!;
      // 变量位按真值表变量顺序拼成最小项编号（变量 0 是最高位）
      let mask = 0;
      const bitOfVar = new Map<number, number>();
      colAxis.varIndices.forEach((vi, k) => bitOfVar.set(vi, colBits[k]!));
      rowAxis.varIndices.forEach((vi, k) => bitOfVar.set(vi, rowBits[k]!));
      for (let v = 0; v < n; v++) {
        mask = (mask << 1) | bitOfVar.get(v)!;
      }
      cellMinterms[r]!.push(mask);
      const value = table.rows[mask]?.outputs[outputIndex] ?? 0;
      cellValues[r]!.push(value);
      gridOnes[r]!.push(value === 1);
    }
  }

  const allMinterms: number[] = [];
  for (let r = 0; r < rowAxis.size; r++) {
    for (let c = 0; c < colAxis.size; c++) {
      if (gridOnes[r]![c]) allMinterms.push(cellMinterms[r]![c]!);
    }
  }

  const base: KarnaughMapResult = {
    outputId: table.outputIds[outputIndex]!,
    outputName: table.outputNames[outputIndex]!,
    nVars: n,
    rowsVarCount: rowAxis.varCount,
    colsVarCount: colAxis.varCount,
    rowLabels: rowAxis.labels,
    colLabels: colAxis.labels,
    cellMinterms,
    cellValues,
    groups: [],
    simplified: ''
  };

  if (allMinterms.length === 0) {
    return { ...base, simplified: '0', constant: 0, noOnes: true };
  }
  if (allMinterms.length === 2 ** n) {
    return { ...base, simplified: '1', constant: 1, groups: [] };
  }

  // 1) 枚举所有合法全 1 矩形
  const raws = enumerateGroups(
    rowAxis.size,
    colAxis.size,
    gridOnes,
    cellMinterms,
    table.inputNames
  );

  // 2) 质蕴含项：不被另一个候选项的最小项集合真包含
  const primes = raws.filter((g) => {
    const set = new Set(g.minterms);
    return !raws.some((other) => {
      if (other === g) return false;
      if (other.minterms.length <= g.minterms.length) return false;
      return g.minterms.every((m) => other.mintermSet.has(m));
    });
  });

  // 3) 本质质蕴含项：某个最小项只被它覆盖
  const groups: KarnaughGroup[] = primes.map((g) => {
    const essential = g.minterms.some(
      (m) => primes.filter((p) => p.mintermSet.has(m)).length === 1
    );
    return {
      literals: g.literals,
      term: g.term,
      minterms: g.minterms,
      essential,
      pieces: piecesFor(g.rowSeg, g.colSeg, rowAxis.size, colAxis.size)
    };
  });

  // 4) 最简覆盖：本质项必选，其余做集合覆盖
  const required = new Set<number>();
  const covered = new Set<number>();
  for (const g of groups) {
    if (!g.essential) continue;
    for (const m of g.minterms) covered.add(m);
  }
  const remaining = allMinterms.filter((m) => !covered.has(m));
  const optionalGroups = groups.filter((g) => !g.essential);

  if (remaining.length > 0) {
    const chosen = minimumCover(optionalGroups, remaining);
    for (const idx of chosen) required.add(groups.indexOf(optionalGroups[idx]!));
  }
  // 本质项也纳入“选中”（前端可区分颜色）
  groups.forEach((g, i) => {
    if (g.essential) required.add(i);
  });

  const chosenGroups = groups.filter((_, i) => required.has(i));
  const simplified = chosenGroups.map((g) => g.term).join(' + ');

  return { ...base, groups, simplified };
}

interface EnumeratedGroup extends RawGroup {
  mintermSet: Set<number>;
  rowSeg: { start: number; length: number };
  colSeg: { start: number; length: number };
}

function enumerateGroups(
  rowLen: number,
  colLen: number,
  gridOnes: boolean[][],
  cellMinterms: number[][],
  allVarNames: string[]
): EnumeratedGroup[] {
  const rowSegments =
    rowLen === 1
      ? [{ start: 0, length: 1 }]
      : cyclicSegments(rowLen);
  const colSegments = cyclicSegments(colLen);

  const found = new Map<string, EnumeratedGroup>();

  for (const rs of rowSegments) {
    for (const cs of colSegments) {
      const rows = expandSegment(rowLen, rs.start, rs.length);
      const cols = expandSegment(colLen, cs.start, cs.length);
      let allOnes = true;
      const minterms: number[] = [];
      for (const r of rows) {
        for (const c of cols) {
          if (!gridOnes[r]![c]) {
            allOnes = false;
            break;
          }
          minterms.push(cellMinterms[r]![c]!);
        }
        if (!allOnes) break;
      }
      if (!allOnes) continue;

      // 由覆盖格子在各变量位上是否恒定，决定乘积项文字
      const literals = inferLiterals(
        minterms,
        allVarNames,
        allVarNames.length
      );
      const key = [...minterms].sort((a, b) => a - b).join(',');
      if (found.has(key)) continue;
      const term: SopTerm = { literals };
      found.set(key, {
        rows,
        cols,
        minterms: [...minterms].sort((a, b) => a - b),
        mintermSet: new Set(minterms),
        literals,
        term: formatTerm(term),
        rowSeg: rs,
        colSeg: cs
      });
    }
  }
  return [...found.values()];
}

/**
 * 一组最小项中，若某变量在所有项里取值恒定则保留为一个文字，
 * 否则该变量被消去（正体现“圈在一起即消元”）。
 */
function inferLiterals(
  minterms: number[],
  varNames: string[],
  n: number
): Literal[] {
  const literals: Literal[] = [];
  for (let v = 0; v < n; v++) {
    const shift = n - 1 - v;
    let zero = false;
    let one = false;
    for (const m of minterms) {
      if (((m >> shift) & 1) === 1) one = true;
      else zero = true;
    }
    if (zero && one) continue; // 变量被消去
    literals.push({ kind: 'var', name: varNames[v]!, negated: zero });
  }
  return literals;
}

/**
 * 分支限界求最小集合覆盖：
 * 先按“组数最少”，组数相同时文字总数最少（最简 SOP）。
 * 规模上限 16 个最小项、候选质蕴含项几十个，穷举完全够用。
 */
function minimumCover(
  groups: KarnaughGroup[],
  targets: number[]
): number[] {
  const targetSet = new Set(targets);
  const coverMasks = groups.map((g) => {
    let mask = 0;
    targets.forEach((m, i) => {
      if (g.minterms.includes(m)) mask |= 1 << i;
    });
    return mask;
  });
  const full = (1 << targets.length) - 1;
  const costs = groups.map((g) => g.literals.length);

  let best: number[] | null = null;
  let bestCost = Infinity;
  let bestLiterals = Infinity;

  const dfs = (state: number, chosen: number[], chosenMask: number, litCount: number) => {
    if (chosen.length > bestCost) return;
    if (state === full) {
      if (
        chosen.length < bestCost ||
        (chosen.length === bestCost && litCount < bestLiterals)
      ) {
        bestCost = chosen.length;
        bestLiterals = litCount;
        best = [...chosen];
      }
      return;
    }
    // 找尚未被覆盖的最小项中，可选质蕴含项最少的一个（MRV）
    let pivotOptions: number[] = [];
    let bestBranching = Infinity;
    for (let i = 0; i < targets.length; i++) {
      if ((state & (1 << i)) !== 0) continue;
      const options: number[] = [];
      coverMasks.forEach((mask, gi) => {
        if ((mask & (1 << i)) !== 0 && (chosenMask & (1 << gi)) === 0) {
          options.push(gi);
        }
      });
      if (options.length === 0) return; // 理论上不会发生（质蕴含项完备）
      if (options.length < bestBranching) {
        bestBranching = options.length;
        pivotOptions = options;
      }
    }
    // 优先选覆盖多、文字少的组
    const sorted = [...pivotOptions].sort((a, b) => {
      const popDiff = popcount(coverMasks[b]! & ~state) - popcount(coverMasks[a]! & ~state);
      if (popDiff !== 0) return popDiff;
      return costs[a]! - costs[b]!;
    });
    for (const gi of sorted) {
      chosen.push(gi);
      dfs(state | coverMasks[gi]!, chosen, chosenMask | (1 << gi), litCount + costs[gi]!);
      chosen.pop();
    }
  };

  dfs(0, [], 0, 0);
  return best ?? [];
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** 为真值表的全部输出生成卡诺图（输入变量 2~4 个时） */
export function buildAllKarnaughMaps(
  table: TruthTable
): KarnaughMapResult[] {
  return table.outputIds.map((_, i) => buildKarnaughMap(table, i));
}
