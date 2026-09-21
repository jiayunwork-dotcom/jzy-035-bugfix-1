import { describe, expect, it } from 'vitest';
import { buildTruthTable, truthTableToCsv } from '../src/truthTable.js';
import type { Circuit } from '../src/types.js';

/** 用连线三元组 [sourceId, targetId, inputPort] 快速搭电路 */
function makeCircuit(
  gateType: 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'xnor' | 'not',
  labels = ['A', 'B']
): Circuit {
  const inputs =
    gateType === 'not'
      ? [{ id: 'a', type: 'input' as const, x: 0, y: 0, label: labels[0], value: 0 }]
      : [
          { id: 'a', type: 'input' as const, x: 0, y: 0, label: labels[0], value: 0 },
          { id: 'b', type: 'input' as const, x: 0, y: 60, label: labels[1], value: 0 }
        ];
  const gate = { id: 'g', type: gateType, x: 150, y: 30 };
  const out = { id: 'y', type: 'output' as const, x: 300, y: 30, label: 'Y' };
  const edges =
    gateType === 'not'
      ? [
          { id: 'e1', source: 'a', target: 'g', inputPort: 0 },
          { id: 'e2', source: 'g', target: 'y', inputPort: 0 }
        ]
      : [
          { id: 'e1', source: 'a', target: 'g', inputPort: 0 },
          { id: 'e2', source: 'b', target: 'g', inputPort: 1 },
          { id: 'e3', source: 'g', target: 'y', inputPort: 0 }
        ];
  return { nodes: [...inputs, gate, out], edges };
}

describe('真值表穷举', () => {
  it('二输入与门逐行正确（2^2 = 4 行）', () => {
    const table = buildTruthTable(makeCircuit('and'));
    expect(table.rowCount).toBe(4);
    expect(table.inputNames).toEqual(['A', 'B']);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);
  });

  it('二输入异或门逐行正确', () => {
    const table = buildTruthTable(makeCircuit('xor'));
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 1, 1, 0]);
  });

  it('非门 1 个输入仍可穷举 2 行', () => {
    const table = buildTruthTable(makeCircuit('not'));
    expect(table.rows.map((r) => r.outputs[0])).toEqual([1, 0]);
  });

  it('三输入多数表决电路 8 行逐行正确：AB + AC + BC', () => {
    // 三个与门 + 一个或门(2 输入) + 一个或门
    const circuit: Circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: 0 },
        { id: 'b', type: 'input', x: 0, y: 60, label: 'B', value: 0 },
        { id: 'c', type: 'input', x: 0, y: 120, label: 'C', value: 0 },
        { id: 'g1', type: 'and', x: 160, y: 10 },
        { id: 'g2', type: 'and', x: 160, y: 80 },
        { id: 'g3', type: 'and', x: 160, y: 150 },
        { id: 'o1', type: 'or', x: 320, y: 45 },
        { id: 'o2', type: 'or', x: 480, y: 90 },
        { id: 'y', type: 'output', x: 640, y: 90, label: 'Y' }
      ],
      edges: [
        { id: '1', source: 'a', target: 'g1', inputPort: 0 },
        { id: '2', source: 'b', target: 'g1', inputPort: 1 },
        { id: '3', source: 'a', target: 'g2', inputPort: 0 },
        { id: '4', source: 'c', target: 'g2', inputPort: 1 },
        { id: '5', source: 'b', target: 'g3', inputPort: 0 },
        { id: '6', source: 'c', target: 'g3', inputPort: 1 },
        { id: '7', source: 'g1', target: 'o1', inputPort: 0 },
        { id: '8', source: 'g2', target: 'o1', inputPort: 1 },
        { id: '9', source: 'o1', target: 'o2', inputPort: 0 },
        { id: '10', source: 'g3', target: 'o2', inputPort: 1 },
        { id: '11', source: 'o2', target: 'y', inputPort: 0 }
      ]
    };
    const table = buildTruthTable(circuit);
    expect(table.rowCount).toBe(8);
    // 000 001 010 011 100 101 110 111
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1, 0, 1, 1, 1]);
  });

  it('行顺序：第一变量为最高位，输入向量按二进制递增', () => {
    const table = buildTruthTable(makeCircuit('or'));
    expect(table.rows.map((r) => r.inputs)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ]);
  });

  it('CSV 导出包含表头与全部行', () => {
    const csv = truthTableToCsv(buildTruthTable(makeCircuit('and')));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('A,B,Y');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('1,1,1');
  });

  it('变量数达到警告阈值时给出提示但仍然生成', () => {
    const n = 10;
    const nodes = [
      ...Array.from({ length: n }, (_, i) => ({
        id: `x${i}`,
        type: 'input' as const,
        x: 0,
        y: i * 40,
        label: `X${i}`,
        value: 0 as const
      })),
      // 恒 0 输出：一个输入悬空的与门（两个 0 输入相与）
      { id: 'g', type: 'and' as const, x: 200, y: 0 },
      { id: 'y', type: 'output' as const, x: 400, y: 0, label: 'Y' }
    ];
    const edges = [
      { id: 'd0', source: 'x0', target: 'g', inputPort: 0 },
      { id: 'd1', source: 'g', target: 'y', inputPort: 0 }
    ];
    const table = buildTruthTable({ nodes, edges });
    expect(table.rowCount).toBe(1024);
    expect(table.warning).toMatch(/1,024/);
    expect(table.rows).toHaveLength(1024);
  });

  it('超过硬上限直接抛错', () => {
    const nodes = Array.from({ length: 21 }, (_, i) => ({
      id: `x${i}`,
      type: 'input' as const,
      x: 0,
      y: i * 30,
      label: `X${i}`,
      value: 0 as const
    }));
    expect(() => buildTruthTable({ nodes, edges: [] })).toThrow(/上限/);
  });

  it('有环的电路不生成真值表', () => {
    const circuit: Circuit = {
      nodes: [
        { id: 'g1', type: 'not', x: 0, y: 0 },
        { id: 'g2', type: 'not', x: 150, y: 0 },
        { id: 'y', type: 'output', x: 300, y: 0 }
      ],
      edges: [
        { id: '1', source: 'g1', target: 'g2', inputPort: 0 },
        { id: '2', source: 'g2', target: 'g1', inputPort: 0 },
        { id: '3', source: 'g2', target: 'y', inputPort: 0 }
      ]
    };
    expect(() => buildTruthTable(circuit)).toThrow(/反馈环/);
  });
});
