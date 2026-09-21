import { describe, expect, it } from 'vitest';
import { buildKarnaughMap } from '../src/karnaugh.js';
import type { Bit, TruthTable } from '../src/types.js';

function table(nVars: number, outputs: Bit[], names?: string[]): TruthTable {
  const inputNames = names ?? ['A', 'B', 'C', 'D'].slice(0, nVars);
  return {
    inputIds: inputNames.map((n) => n.toLowerCase()),
    inputNames,
    outputIds: ['y'],
    outputNames: ['Y'],
    rowCount: outputs.length,
    rows: outputs.map((out, mask) => ({
      inputs: inputNames.map((_, i) => ((mask >> (nVars - 1 - i)) & 1) as Bit),
      outputs: [out]
    }))
  };
}

/** 展开最简表达式里的所有项（集合比较，顺序无关） */
function terms(expr: string): string[] {
  return expr.split(' + ').sort();
}

describe('卡诺图化简', () => {
  it('2 变量：与门 -> A·B', () => {
    const km = buildKarnaughMap(table(2, [0, 0, 0, 1]), 0);
    expect(km.simplified).toBe('A·B');
    expect(km.colLabels).toEqual(['00', '01', '11', '10']);
    expect(km.rowLabels).toEqual(['']);
    expect(km.groups.length).toBeGreaterThan(0);
    expect(km.groups.every((g) => g.essential)).toBe(true);
  });

  it('2 变量：或门 -> A + B（两个跨边界/相邻的 2 格圈）', () => {
    const km = buildKarnaughMap(table(2, [0, 1, 1, 1]), 0);
    expect(terms(km.simplified)).toEqual(['A', 'B']);
  });

  it('2 变量：异或 -> A′·B + A·B′（对角 1 不能圈，保持两项）', () => {
    const km = buildKarnaughMap(table(2, [0, 1, 1, 0]), 0);
    expect(terms(km.simplified)).toEqual(["A'·B", "A·B'"]);
  });

  it('2 变量：恒 0 / 恒 1 的退化情况', () => {
    expect(buildKarnaughMap(table(2, [0, 0, 0, 0]), 0).simplified).toBe('0');
    const allOne = buildKarnaughMap(table(2, [1, 1, 1, 1]), 0);
    expect(allOne.simplified).toBe('1');
    expect(allOne.constant).toBe(1);
  });

  it('3 变量：多数表决 -> A·B + A·C + B·C', () => {
    const km = buildKarnaughMap(table(3, [0, 0, 0, 1, 0, 1, 1, 1]), 0);
    expect(terms(km.simplified)).toEqual(['A·B', 'A·C', 'B·C'].sort());
    // 列按格雷码 00 01 11 10
    expect(km.colLabels).toEqual(['00', '01', '11', '10']);
    expect(km.rowLabels).toEqual(['0', '1']);
    // 每个圈覆盖的格子都确实是 1
    for (const g of km.groups) {
      for (const m of g.minterms) expect(km.cellValues.flat()[km.cellMinterms.flat().indexOf(m)]).toBe(1);
    }
  });

  it('3 变量：或门 -> A + B + C，利用跨边界圈', () => {
    // 除 000 外全 1
    const km = buildKarnaughMap(table(3, [0, 1, 1, 1, 1, 1, 1, 1]), 0);
    expect(terms(km.simplified)).toEqual(['A', 'B', 'C'].sort());
  });

  it('3 变量：异或（奇偶）对角 1 无法合并 -> 4 个最小项', () => {
    // m1,m2,m4,m7
    const km = buildKarnaughMap(table(3, [0, 1, 1, 0, 1, 0, 0, 1]), 0);
    expect(km.groups).toHaveLength(4);
    expect(km.simplified.split(' + ')).toHaveLength(4);
  });

  it('4 变量：典型化简 F = Σm(0,2,5,7,8,10,13,15) -> B′D′ + BD', () => {
    const outputs = Array.from({ length: 16 }, (_, m) =>
      [0, 2, 5, 7, 8, 10, 13, 15].includes(m) ? (1 as Bit) : (0 as Bit)
    );
    const km = buildKarnaughMap(table(4, outputs), 0);
    expect(terms(km.simplified)).toEqual(["B·D", "B'·D'"].sort());
  });

  it('4 变量：跨四角的圈消掉两个变量 -> B′D′', () => {
    // 四角 m0,m2,m8,m10
    const outputs = Array.from({ length: 16 }, (_, m) =>
      [0, 2, 8, 10].includes(m) ? (1 as Bit) : (0 as Bit)
    );
    const km = buildKarnaughMap(table(4, outputs), 0);
    expect(terms(km.simplified)).toEqual(["B'·D'"]);
    const group = km.groups.find((g) => g.term === "B'·D'")!;
    expect(group.minterms.slice().sort((x, y) => x - y)).toEqual([0, 2, 8, 10]);
    // 跨边界的圈被拆成多片矩形
    expect(group.pieces.length).toBeGreaterThanOrEqual(2);
  });

  it('4 变量：全 1 -> 1；全 0 -> 0', () => {
    expect(buildKarnaughMap(table(4, Array(16).fill(1)), 0).simplified).toBe('1');
    expect(buildKarnaughMap(table(4, Array(16).fill(0)), 0).simplified).toBe('0');
  });

  it('圈出的每个质蕴含项是本质项或参与最简覆盖，且覆盖全部 1 格', () => {
    const outputs = Array.from({ length: 16 }, (_, m) =>
      [0, 1, 2, 5, 6, 7, 8, 9, 10, 14].includes(m) ? (1 as Bit) : (0 as Bit)
    );
    const km = buildKarnaughMap(table(4, outputs), 0);
    // 用最简表达式反算覆盖的最小项数，应恰好等于 1 的个数
    const ones = outputs.filter((v) => v === 1).length;
    const covered = new Set<number>();
    for (const g of km.groups) g.minterms.forEach((m) => covered.add(m));
    // groups 包含全部质蕴含项（可能比最简解多），所以覆盖集应至少包含所有 1
    expect(covered.size).toBeGreaterThanOrEqual(ones);
    for (const m of outputs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)) {
      expect(covered.has(m)).toBe(true);
    }
  });

  it('变量数不在 2~4 范围抛错（由上层决定不给卡诺图）', async () => {
    const { buildTruthTable } = await import('../src/truthTable.js');
    // 5 变量真实电路：输出 = 五个输入相与
    const nodes = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `x${i}`,
        type: 'input' as const,
        x: 0,
        y: i * 40,
        label: ['A', 'B', 'C', 'D', 'E'][i],
        value: 0 as const
      }))
    ];
    const gates = [
      { id: 'a1', type: 'and' as const, x: 200, y: 40 },
      { id: 'a2', type: 'and' as const, x: 360, y: 80 },
      { id: 'a3', type: 'and' as const, x: 520, y: 120 },
      { id: 'a4', type: 'and' as const, x: 680, y: 160 },
      { id: 'y', type: 'output' as const, x: 840, y: 160 }
    ];
    const edges = [
      { id: 'e0', source: 'x0', target: 'a1', inputPort: 0 },
      { id: 'e1', source: 'x1', target: 'a1', inputPort: 1 },
      { id: 'e2', source: 'a1', target: 'a2', inputPort: 0 },
      { id: 'e3', source: 'x2', target: 'a2', inputPort: 1 },
      { id: 'e4', source: 'a2', target: 'a3', inputPort: 0 },
      { id: 'e5', source: 'x3', target: 'a3', inputPort: 1 },
      { id: 'e6', source: 'a3', target: 'a4', inputPort: 0 },
      { id: 'e7', source: 'x4', target: 'a4', inputPort: 1 },
      { id: 'e8', source: 'a4', target: 'y', inputPort: 0 }
    ];
    const t = buildTruthTable({ nodes: [...nodes, ...gates], edges });
    expect(() => buildKarnaughMap(t, 0)).toThrow(/2~4/);
  });
});
