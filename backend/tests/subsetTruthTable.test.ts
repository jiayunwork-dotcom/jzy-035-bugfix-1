import { describe, expect, it } from 'vitest';
import {
  buildTruthTable,
  extractSop,
  withValues
} from '../src/truthTable.js';
import { evaluate } from '../src/evaluate.js';
import { buildKarnaughMap } from '../src/karnaugh.js';
import type { Bit, Circuit } from '../src/types.js';

/** 三个输入 A、B、C，输出 Y = A·C（B 完全不参与逻辑） */
function andAcCircuit(bValue: 0 | 1 = 0): Circuit {
  return {
    nodes: [
      { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: 0 },
      { id: 'b', type: 'input', x: 0, y: 60, label: 'B', value: bValue },
      { id: 'c', type: 'input', x: 0, y: 120, label: 'C', value: 0 },
      { id: 'g', type: 'and', x: 160, y: 40 },
      { id: 'y', type: 'output', x: 320, y: 40, label: 'Y' }
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'g', inputPort: 0 },
      { id: 'e2', source: 'c', target: 'g', inputPort: 1 },
      { id: 'e3', source: 'g', target: 'y', inputPort: 0 }
    ]
  };
}

/** 三输入与：两级与门实现 Y = A·B·C（工具的门均为二输入） */
function and3Circuit(values: Bit[] = [0, 0, 0]): Circuit {
  return {
    nodes: [
      { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: values[0] },
      { id: 'b', type: 'input', x: 0, y: 60, label: 'B', value: values[1] },
      { id: 'c', type: 'input', x: 0, y: 120, label: 'C', value: values[2] },
      { id: 'g1', type: 'and', x: 160, y: 30 },
      { id: 'g2', type: 'and', x: 300, y: 60 },
      { id: 'y', type: 'output', x: 440, y: 60, label: 'Y' }
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'g1', inputPort: 0 },
      { id: 'e2', source: 'b', target: 'g1', inputPort: 1 },
      { id: 'e3', source: 'g1', target: 'g2', inputPort: 0 },
      { id: 'e4', source: 'c', target: 'g2', inputPort: 1 },
      { id: 'e5', source: 'g2', target: 'y', inputPort: 0 }
    ]
  };
}

/** 独立参照：不经过 withValues，自己把指定开关设值后直接求值 */
function oracleEval(circuit: Circuit, values: Bit[], ids: string[]): Bit {
  const byId = new Map(ids.map((id, i) => [id, values[i]!]));
  const probe: Circuit = {
    nodes: circuit.nodes.map((n) =>
      n.type === 'input' && byId.has(n.id) ? { ...n, value: byId.get(n.id) } : n
    ),
    edges: circuit.edges
  };
  return evaluate(probe).outputLights['y']!;
}

describe('子集穷举：只挑部分输入、其余钉在当前电平', () => {
  it('备课踩坑场景：只枚举 A、C（B 固定 0），A·C 的四行只有 A=C=1 亮', () => {
    const table = buildTruthTable(andAcCircuit(0), { inputIds: ['a', 'c'] });
    expect(table.rowCount).toBe(4);
    expect(table.inputIds).toEqual(['a', 'c']);
    expect(table.inputNames).toEqual(['A', 'C']);
    expect(table.rows.map((r) => r.inputs)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ]);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);
  });

  it('同一电路全选穷举仍是 8 行且 A·C 该亮的两行不差（别改坏全选）', () => {
    const table = buildTruthTable(andAcCircuit(0));
    expect(table.rowCount).toBe(8);
    expect(table.inputNames).toEqual(['A', 'B', 'C']);
    // B 与输出无关：ABC = 101、111 两行亮
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
  });

  it('没被选中的开关保持当前电平参与运算：三输入与门只枚举 A、C', () => {
    // B 钉在 1：Y = A·1·C = A·C
    const high = buildTruthTable(and3Circuit([0, 1, 0]), { inputIds: ['a', 'c'] });
    expect(high.inputNames).toEqual(['A', 'C']);
    expect(high.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);

    // B 钉在 0：Y = A·0·C ≡ 0（旧实现扫的是 A、B，C=0 恒定，同样全 0，
    // 但下面的 SOP/逐行检查能区分；这里再用 B=1 锁定对位关系）
    const low = buildTruthTable(and3Circuit([0, 0, 0]), { inputIds: ['a', 'c'] });
    expect(low.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 0]);
  });

  it('选中集合非画布前缀也不错位：只枚举 B、C，A 钉在固定电平', () => {
    // A=1：Y = 1·B·C = B·C
    const t = buildTruthTable(and3Circuit([1, 0, 0]), { inputIds: ['b', 'c'] });
    expect(t.inputIds).toEqual(['b', 'c']);
    expect(t.inputNames).toEqual(['B', 'C']);
    expect(t.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);

    // A=0：恒 0
    const t0 = buildTruthTable(and3Circuit([0, 0, 0]), { inputIds: ['b', 'c'] });
    expect(t0.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 0]);
  });

  it('调用方给出的列顺序被如实遵守：枚举 [C, A] 时列依次为 C、A', () => {
    const t = buildTruthTable(andAcCircuit(0), { inputIds: ['c', 'a'] });
    expect(t.inputIds).toEqual(['c', 'a']);
    expect(t.inputNames).toEqual(['C', 'A']);
    // 行按 (C,A) 二进制递增：00,01,10,11 -> C·A 仅 11 行亮
    expect(t.rows.map((r) => [r.inputs, r.outputs[0]] as const)).toEqual([
      [[0, 0], 0],
      [[0, 1], 0],
      [[1, 0], 0],
      [[1, 1], 1]
    ]);
  });

  it('子集真值表 -> SOP 回到正确结果（最小项随列对位重排）', () => {
    const t = buildTruthTable(and3Circuit([0, 1, 0]), { inputIds: ['a', 'c'] });
    const expr = extractSop(t, 0);
    expect(expr.minterms).toEqual([3]);
    expect(expr.canonical).toBe('A·C');
  });

  it('子集真值表 -> 2 变量卡诺图化简为 A·C', () => {
    const t = buildTruthTable(and3Circuit([0, 1, 0]), { inputIds: ['a', 'c'] });
    const km = buildKarnaughMap(t, 0);
    expect(km.nVars).toBe(2);
    expect(km.simplified).toBe('A·C');
    // 唯一的 1 格在 A=1,C=1（最小项 3）
    expect(km.cellValues.flat().filter((v) => v === 1)).toEqual([1]);
    const covered = km.groups.flatMap((g) => g.minterms);
    expect(covered).toContain(3);
  });

  it('未选中开关为 1 时，子集结果可以恒 1（与"开关没参与"的假全 0 区分）', () => {
    // Y = A·B·C，只枚举 A，B=C=1 -> Y = A
    const t = buildTruthTable(and3Circuit([0, 1, 1]), { inputIds: ['a'] });
    expect(t.rowCount).toBe(2);
    expect(t.rows.map((r) => r.outputs[0])).toEqual([0, 1]);
  });
});

describe('withValues：按 id 对位替换，其余输入原样保留', () => {
  it('只替换 ids 里点名的开关，未点名开关保留电路当前电平', () => {
    const circuit = and3Circuit([1, 0, 1]);
    const next = withValues(circuit, [1], ['b']);
    const byId = new Map(next.nodes.map((n) => [n.id, n]));
    expect(byId.get('a')!.value).toBe(1); // 未点名：保持 1
    expect(byId.get('b')!.value).toBe(1); // 点名：被替换
    expect(byId.get('c')!.value).toBe(1); // 未点名：保持 1
  });

  it('子集枚举位不会按画布位置错配到别的开关（复现课上的坑）', () => {
    const circuit = and3Circuit([0, 1, 0]);
    // 枚举 A、C 的 [1,1]：必须是 A=1、C=1，B 保持当前电平 1
    const next = withValues(circuit, [1, 1], ['a', 'c']);
    const byId = new Map(next.nodes.map((n) => [n.id, n]));
    expect(byId.get('a')!.value).toBe(1);
    expect(byId.get('b')!.value).toBe(1);
    expect(byId.get('c')!.value).toBe(1);
    expect(evaluate(next).outputLights['y']).toBe(1);
  });

  it('不传 ids 时等价于按画布顺序替换全部输入（全选路径）', () => {
    const circuit = and3Circuit([0, 0, 0]);
    const next = withValues(circuit, [1, 0, 1]);
    const byId = new Map(next.nodes.map((n) => [n.id, n]));
    expect(byId.get('a')!.value).toBe(1);
    expect(byId.get('b')!.value).toBe(0);
    expect(byId.get('c')!.value).toBe(1);
  });

  it('返回新电路对象，不修改入参', () => {
    const circuit = and3Circuit([0, 0, 0]);
    const snapshot = circuit.nodes.map((n) => n.value);
    withValues(circuit, [1, 1], ['a', 'c']);
    expect(circuit.nodes.map((n) => n.value)).toEqual(snapshot);
  });
});

describe('子集穷举性质：每一行都等于"选中位按列代入、其余保持电平"的直接求值', () => {
  const scenarios: { name: string; circuit: Circuit; ids: string[] }[] = [
    { name: 'A·C 中选 A,C（B 钉 1）', circuit: and3Circuit([0, 1, 0]), ids: ['a', 'c'] },
    { name: 'A·C 中选 A,C（B 钉 0）', circuit: and3Circuit([0, 0, 0]), ids: ['a', 'c'] },
    { name: '选 B,C（A 钉 1）', circuit: and3Circuit([1, 0, 0]), ids: ['b', 'c'] },
    { name: '只选 A（B=C=1）', circuit: and3Circuit([0, 1, 1]), ids: ['a'] },
    { name: '倒序选 C,B,A（全选但乱序）', circuit: and3Circuit([0, 0, 0]), ids: ['c', 'b', 'a'] }
  ];

  for (const { name, circuit, ids } of scenarios) {
    it(name, () => {
      const table = buildTruthTable(circuit, { inputIds: ids });
      expect(table.inputIds).toEqual(ids);
      for (const row of table.rows) {
        expect(row.outputs[0]).toBe(oracleEval(circuit, row.inputs, ids));
      }
    });
  }

  it('全选与子集结果在固定电平取值上互相吻合（A·C 电路，B 固定 0）', () => {
    const circuit = andAcCircuit(0);
    const all = buildTruthTable(circuit);
    const sub = buildTruthTable(circuit, { inputIds: ['a', 'c'] });
    for (const row of sub.rows) {
      const [a, c] = row.inputs;
      // 全表里 B=0 的对应行索引：A 0 C -> 2*a + c
      const fullRow = all.rows[a! * 4 + 0 * 2 + c!]!;
      expect(fullRow.inputs).toEqual([a, 0, c]);
      expect(fullRow.outputs[0]).toBe(row.outputs[0]);
    }
  });
});
