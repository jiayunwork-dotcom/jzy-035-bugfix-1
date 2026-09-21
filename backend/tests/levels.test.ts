import { describe, expect, it } from 'vitest';
import { getLevel, LEVELS, verifyCircuit } from '../src/levels.js';
import type { Circuit } from '../src/types.js';

/** 若干输入开关 -> 单个输出，中间用 gates 描述；连线自动按端口接好 */
function build(
  inputIds: string[],
  chain: { id: string; type: string; inputs: string[] }[],
  outputId = 'y'
): Circuit {
  const nodes = [
    ...inputIds.map((id, i) => ({
      id,
      type: 'input' as const,
      x: 0,
      y: i * 60,
      value: 0 as const
    })),
    ...chain.map((g, i) => ({ id: g.id, type: g.type as never, x: 200 + i * 160, y: i * 60 })),
    { id: outputId, type: 'output' as const, x: 200 + chain.length * 160, y: 0 }
  ];
  const edges: Circuit['edges'] = [];
  for (const g of chain) {
    g.inputs.forEach((src, port) => {
      edges.push({ id: `${g.id}-in${port}`, source: src, target: g.id, inputPort: port });
    });
  }
  const last = chain[chain.length - 1]!.id;
  edges.push({ id: 'out', source: last, target: outputId, inputPort: 0 });
  return { nodes, edges };
}

describe('教学关卡', () => {
  it('关卡定义齐全且目标真值表行数 = 2^输入数', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(5);
    for (const level of LEVELS) {
      expect(level.expected).toHaveLength(2 ** level.inputCount);
      expect(level.expected.every((row) => row.length === level.outputCount)).toBe(true);
    }
  });

  it('第 1 关：非门正确实现 -> 通关（走真实求值）', () => {
    const circuit = build(['a'], [{ id: 'g', type: 'not', inputs: ['a'] }]);
    const result = verifyCircuit(circuit, getLevel('not-gate')!);
    expect(result.passed).toBe(true);
    expect(result.evaluable).toBe(true);
  });

  it('第 1 关：拿与门冒充 -> 不通关，且有不匹配行', () => {
    // 单输入接到与门的一个口，另一口悬空=0，恒输出 0
    const circuit = build(['a'], [{ id: 'g', type: 'and', inputs: ['a'] }]);
    const result = verifyCircuit(circuit, getLevel('not-gate')!);
    expect(result.passed).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('第 3 关：异或门实现 -> 通关', () => {
    const circuit = build(
      ['a', 'b'],
      [{ id: 'g', type: 'xor', inputs: ['a', 'b'] }]
    );
    expect(verifyCircuit(circuit, getLevel('xor2')!).passed).toBe(true);
  });

  it('第 3 关：或门（结构看起来也挺像异或）-> 不通关', () => {
    const circuit = build(
      ['a', 'b'],
      [{ id: 'g', type: 'or', inputs: ['a', 'b'] }]
    );
    const result = verifyCircuit(circuit, getLevel('xor2')!);
    // 11 行：或=1 而异或应为 0
    expect(result.passed).toBe(false);
    expect(result.mismatches.some((m) => m.row === 3)).toBe(true);
  });

  it('第 4 关：多数表决 AB+AC+BC -> 通关', () => {
    const circuit: Circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, value: 0 },
        { id: 'b', type: 'input', x: 0, y: 60, value: 0 },
        { id: 'c', type: 'input', x: 0, y: 120, value: 0 },
        { id: 'g1', type: 'and', x: 200, y: 10 },
        { id: 'g2', type: 'and', x: 200, y: 80 },
        { id: 'g3', type: 'and', x: 200, y: 150 },
        { id: 'o1', type: 'or', x: 380, y: 50 },
        { id: 'o2', type: 'or', x: 560, y: 90 },
        { id: 'y', type: 'output', x: 740, y: 90 }
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
    const result = verifyCircuit(circuit, getLevel('majority3')!);
    expect(result.passed).toBe(true);
  });

  it('第 4 关：结构很复杂但恒输出 0 的电路不会蒙混过关', () => {
    // A 与 A'（经非门）再或起来恒 0…… 这里直接造恒 0 多级网络
    const circuit: Circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, value: 0 },
        { id: 'b', type: 'input', x: 0, y: 60, value: 0 },
        { id: 'c', type: 'input', x: 0, y: 120, value: 0 },
        { id: 'g1', type: 'and', x: 200, y: 10 },
        { id: 'g2', type: 'and', x: 200, y: 90 },
        { id: 'o1', type: 'or', x: 400, y: 50 },
        { id: 'y', type: 'output', x: 600, y: 50 }
      ],
      edges: [
        { id: '1', source: 'a', target: 'g1', inputPort: 0 },
        { id: '2', source: 'b', target: 'g1', inputPort: 1 },
        { id: '3', source: 'b', target: 'g2', inputPort: 0 },
        { id: '4', source: 'c', target: 'g2', inputPort: 1 },
        { id: '5', source: 'g1', target: 'o1', inputPort: 0 },
        { id: '6', source: 'g2', target: 'o1', inputPort: 1 },
        { id: '7', source: 'o1', target: 'y', inputPort: 0 }
      ]
    };
    const result = verifyCircuit(circuit, getLevel('majority3')!);
    expect(result.passed).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('反馈环电路不能参与验证：evaluable=false 且不通关', () => {
    const circuit: Circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, value: 0 },
        { id: 'b', type: 'input', x: 0, y: 60, value: 0 },
        { id: 'c', type: 'input', x: 0, y: 120, value: 0 },
        { id: 'g1', type: 'nand', x: 200, y: 20 },
        { id: 'g2', type: 'nand', x: 380, y: 80 },
        { id: 'y', type: 'output', x: 560, y: 80 }
      ],
      edges: [
        { id: '1', source: 'a', target: 'g1', inputPort: 0 },
        { id: '2', source: 'g1', target: 'g2', inputPort: 0 },
        { id: '3', source: 'b', target: 'g2', inputPort: 1 },
        { id: '4', source: 'g2', target: 'g1', inputPort: 1 },
        { id: '5', source: 'g2', target: 'y', inputPort: 0 }
      ]
    };
    const result = verifyCircuit(circuit, getLevel('majority3')!);
    expect(result.passed).toBe(false);
    expect(result.evaluable).toBe(false);
    expect(result.message).toMatch(/环/);
  });

  it('输入数量不符直接判不可比，不做结构猜测', () => {
    const circuit = build(
      ['a', 'b'],
      [{ id: 'g', type: 'and', inputs: ['a', 'b'] }]
    );
    const result = verifyCircuit(circuit, getLevel('majority3')!);
    expect(result.evaluable).toBe(false);
    expect(result.passed).toBe(false);
  });
});
