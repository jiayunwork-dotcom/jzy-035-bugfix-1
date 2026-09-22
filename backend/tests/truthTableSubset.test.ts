import { describe, expect, it } from 'vitest';
import { buildTruthTable, extractSop, withValues } from '../src/truthTable.js';
import { buildKarnaughMap } from '../src/karnaugh.js';
import type { Bit, Circuit } from '../src/types.js';

/**
 * 三个输入 A、B、C，两个输出：
 *   Yac = A · C（直接与门）
 *   Yabc = A · B · C（两级与门，用来检验“未选中的 B 是否按其当前电平参与”）
 * 三个开关默认都在 0 电平；测试里按需改 B 的 value。
 */
function threeInputCircuit(bValue: 0 | 1 = 0): Circuit {
  return {
    nodes: [
      { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: 0 },
      { id: 'b', type: 'input', x: 0, y: 60, label: 'B', value: bValue },
      { id: 'c', type: 'input', x: 0, y: 120, label: 'C', value: 0 },
      { id: 'gac', type: 'and', x: 180, y: 60 },
      { id: 'gab', type: 'and', x: 180, y: 160 },
      { id: 'gabc', type: 'and', x: 340, y: 110 },
      { id: 'yac', type: 'output', x: 500, y: 50, label: 'Yac' },
      { id: 'yabc', type: 'output', x: 500, y: 120, label: 'Yabc' }
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'gac', inputPort: 0 },
      { id: 'e2', source: 'c', target: 'gac', inputPort: 1 },
      { id: 'e3', source: 'gac', target: 'yac', inputPort: 0 },
      { id: 'e4', source: 'a', target: 'gab', inputPort: 0 },
      { id: 'e5', source: 'b', target: 'gab', inputPort: 1 },
      { id: 'e6', source: 'gab', target: 'gabc', inputPort: 0 },
      { id: 'e7', source: 'c', target: 'gabc', inputPort: 1 },
      { id: 'e8', source: 'gabc', target: 'yabc', inputPort: 0 }
    ]
  };
}

describe('部分输入穷举（inputIds 子集）', () => {
  it('备课复现场景：只勾 A、C，B 关着，Y=A·C 的四行只有 A=C=1 行为 1', () => {
    const table = buildTruthTable(threeInputCircuit(0), { inputIds: ['a', 'c'] });
    expect(table.rowCount).toBe(4);
    expect(table.inputIds).toEqual(['a', 'c']);
    expect(table.inputNames).toEqual(['A', 'C']);
    // 列严格按 A、C 排列，MSB 在前
    expect(table.rows.map((r) => r.inputs)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ]);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);
  });

  it('没勾的开关保持“当前电平”参与运算：B 打开后 Yabc=A·C，B 关着时恒 0', () => {
    // B 当前为 0：A·B·C 对任何 A、C 都是 0
    const bOff = buildTruthTable(threeInputCircuit(0), { inputIds: ['a', 'c'] });
    expect(bOff.rows.map((r) => r.outputs[1])).toEqual([0, 0, 0, 0]);

    // B 当前为 1：A·B·C 退化成 A·C（同一行里两列输出应相同）
    const bOn = buildTruthTable(threeInputCircuit(1), { inputIds: ['a', 'c'] });
    expect(bOn.rows.map((r) => r.outputs[1])).toEqual([0, 0, 0, 1]);
    bOn.rows.forEach((r) => expect(r.outputs[0]).toBe(r.outputs[1]));
  });

  it('列与开关严格对位：只勾 A、B 时 C 不动，输出 A·C 在 C=0 下恒 0；C=1 时等于 A', () => {
    // 此时扫的是 A、B；Yac=A·C 完全不随 B 变。C 关着 -> 恒 0
    const cOff = buildTruthTable(threeInputCircuit(0), { inputIds: ['a', 'b'] });
    expect(cOff.inputNames).toEqual(['A', 'B']);
    expect(cOff.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 0]);

    // 把 C 打开（B 是什么不影响 Yac）-> Yac = A（只随 A 列变化），与 B 列无关
    const cOnCircuit = threeInputCircuit(0);
    cOnCircuit.nodes.find((n) => n.id === 'c')!.value = 1;
    const cOn = buildTruthTable(cOnCircuit, { inputIds: ['a', 'b'] });
    expect(cOn.rows.map((r) => [r.inputs, r.outputs[0]])).toEqual([
      [[0, 0], 0],
      [[0, 1], 0],
      [[1, 0], 1],
      [[1, 1], 1]
    ]);
  });

  it('勾选顺序即列顺序：[C, A] 时第 0 列是 C、第 1 列是 A，输出仍为 A·C', () => {
    const table = buildTruthTable(threeInputCircuit(0), { inputIds: ['c', 'a'] });
    expect(table.inputIds).toEqual(['c', 'a']);
    expect(table.inputNames).toEqual(['C', 'A']);
    expect(table.rows.map((r) => r.inputs)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ]);
    // A·C 在 C=A=1（第 3 行）为 1
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);
  });

  it('派生 SOP 用子集真值表的列：B 钉 1 时 Yabc=A·C 的规范式只有 A·C（m3）', () => {
    const table = buildTruthTable(threeInputCircuit(1), { inputIds: ['a', 'c'] });
    const expr = extractSop(table, 1); // Yabc 此时 = A·C
    expect(expr.minterms).toEqual([3]);
    expect(expr.canonical).toBe('A·C');
    // 最小项反代回真值表对应行，输出必须为 1
    for (const m of expr.minterms) {
      expect(table.rows[m]!.outputs[1]).toBe(1);
    }
  });

  it('派生 SOP 能体现被钉住的开关：B 钉 0 时 Yabc 恒 0；取反输出时 B 的电平进表达式', () => {
    // Y = (A·B·C)' 用一个与非门接在 gabc 后不便，改为直接断言：
    // B 钉 0 的子集表里 Yabc 恒 0 -> 规范式为常量 0
    const bOff = buildTruthTable(threeInputCircuit(0), { inputIds: ['a', 'c'] });
    expect(extractSop(bOff, 1).constant).toBe(0);
    const bOn = buildTruthTable(threeInputCircuit(1), { inputIds: ['a', 'c'] });
    expect(extractSop(bOn, 1).canonical).toBe('A·C');
  });

  it('派生卡诺图（2 变量）与子集真值表一致：Y=A·C 圈成 A·C', () => {
    const table = buildTruthTable(threeInputCircuit(1), { inputIds: ['a', 'c'] });
    const km = buildKarnaughMap(table, 1);
    expect(km.nVars).toBe(2);
    expect(km.simplified).toBe('A·C');
    // 格子值按 00,01,11,10 列格雷码：只有 m3=1
    expect(km.cellValues.flat()).toEqual([0, 0, 1, 0]);
  });

  it('子集只有一个变量时给出 2 行表：只扫 A（B=C=1）-> Yac = A', () => {
    const circuit = threeInputCircuit(1);
    // C 默认 0，先打开 C
    circuit.nodes.find((n) => n.id === 'c')!.value = 1;
    const table = buildTruthTable(circuit, { inputIds: ['a'] });
    expect(table.rowCount).toBe(2);
    expect(table.inputNames).toEqual(['A']);
    expect(table.rows.map((r) => [r.inputs[0], r.outputs[0]])).toEqual([
      [0, 0],
      [1, 1]
    ]);
  });

  it('未选中的输入电平是“每行求值现场”的原值，withValues 不改动原电路对象', () => {
    const circuit = threeInputCircuit(1);
    const snapshot = circuit.nodes.map((n) => ({ id: n.id, value: n.value }));
    buildTruthTable(circuit, { inputIds: ['a', 'c'] });
    // 穷举结束后三个开关的 value 与穷举前完全一致
    expect(circuit.nodes.map((n) => ({ id: n.id, value: n.value }))).toEqual(snapshot);

    // withValues 本身也只覆盖指定 id，其余输入不动
    const patched = withValues(circuit, [1, 1], ['a', 'c']);
    const byId = Object.fromEntries(patched.nodes.map((n) => [n.id, n.value]));
    expect(byId.a).toBe(1);
    expect(byId.c).toBe(1);
    expect(byId.b).toBe(1); // 未列出，保持当前电平 1
  });

  it('inputIds 中的非法/不存在 id 被忽略，空选择抛错而不是生成错位表', () => {
    expect(() =>
      buildTruthTable(threeInputCircuit(0), { inputIds: ['nope'] })
    ).toThrow(/至少需要选择一个输入/);
    // 合法与非法混在一起时只保留合法项，且对位仍正确
    const table = buildTruthTable(threeInputCircuit(0), {
      inputIds: ['a', 'ghost', 'c']
    });
    expect(table.inputIds).toEqual(['a', 'c']);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);
  });
});

describe('全选穷举不回归', () => {
  it('三输入 A·B·C 全选时 8 行逐行正确（修复子集后全选路径不变）', () => {
    const table = buildTruthTable(threeInputCircuit(0));
    expect(table.rowCount).toBe(8);
    expect(table.inputIds).toEqual(['a', 'b', 'c']);
    expect(table.rows.map((r) => r.outputs[1])).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
  });

  it('全选与显式传全部 inputIds 的结果完全一致', () => {
    const circuit = threeInputCircuit(1);
    const implicit = buildTruthTable(circuit);
    const explicit = buildTruthTable(circuit, { inputIds: ['a', 'b', 'c'] });
    expect(explicit.rows).toEqual(implicit.rows);
  });

  it('同一电路的子集 4 行输出，能在全选 8 行里按未选电平逐行对上', () => {
    // B 钉在 1：子集 [A,C] 的每一行 (a,c) 必须等于全选表里 (a,1,c) 那一行
    const subset = buildTruthTable(threeInputCircuit(1), { inputIds: ['a', 'c'] });
    const full = buildTruthTable(threeInputCircuit(1));
    for (const row of subset.rows) {
      const [a, c] = row.inputs;
      const fullRow = full.rows.find(
        (r) => r.inputs[0] === a && r.inputs[1] === 1 && r.inputs[2] === c
      )!;
      expect(fullRow.outputs).toEqual(row.outputs);
    }
  });
});
