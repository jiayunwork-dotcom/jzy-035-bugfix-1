import { describe, expect, it } from 'vitest';
import { buildTruthTable, extractAllSop, extractSop } from '../src/truthTable.js';
import type { Bit, TruthTable } from '../src/types.js';

/** 直接从输出向量构造真值表（单输出），变量名 A,B,C,D */
function tableFromOutputs(nVars: number, outputs: Bit[]): TruthTable {
  const names = ['A', 'B', 'C', 'D'].slice(0, nVars);
  return {
    inputIds: names.map((n) => n.toLowerCase()),
    inputNames: names,
    outputIds: ['y'],
    outputNames: ['Y'],
    rowCount: outputs.length,
    rows: outputs.map((out, mask) => ({
      inputs: names.map((_, i) => ((mask >> (nVars - 1 - i)) & 1) as Bit),
      outputs: [out]
    }))
  };
}

describe('SOP 表达式提取', () => {
  it('二输入与门 -> A·B（只有最小项 m3）', () => {
    const table = tableFromOutputs(2, [0, 0, 0, 1]);
    const expr = extractSop(table, 0);
    expect(expr.minterms).toEqual([3]);
    expect(expr.canonical).toBe('A·B');
    expect(expr.terms).toHaveLength(1);
    expect(expr.terms[0]!.literals).toEqual([
      { kind: 'var', name: 'A', negated: false },
      { kind: 'var', name: 'B', negated: false }
    ]);
  });

  it('二输入或门 -> A′·B + A·B′ + A·B，最小项 m1,m2,m3', () => {
    const table = tableFromOutputs(2, [0, 1, 1, 1]);
    const expr = extractSop(table, 0);
    expect(expr.minterms).toEqual([1, 2, 3]);
    expect(expr.canonical).toBe("A'·B + A·B' + A·B");
  });

  it('恒 0 输出表达式为 0，constant=0，无最小项', () => {
    const expr = extractSop(tableFromOutputs(2, [0, 0, 0, 0]), 0);
    expect(expr.constant).toBe(0);
    expect(expr.canonical).toBe('0');
    expect(expr.minterms).toEqual([]);
  });

  it('恒 1 输出表达式为 1，constant=1', () => {
    const expr = extractSop(tableFromOutputs(2, [1, 1, 1, 1]), 0);
    expect(expr.constant).toBe(1);
    expect(expr.canonical).toBe('1');
  });

  it('异或：A′·B + A·B′，与真值表两个 1 一一对应', () => {
    const table = tableFromOutputs(2, [0, 1, 1, 0]);
    const expr = extractSop(table, 0);
    expect(expr.canonical).toBe("A'·B + A·B'");
    // 每个最小项在真值表对应行上输出确实是 1
    for (const m of expr.minterms) {
      expect(table.rows[m]!.outputs[0]).toBe(1);
    }
  });

  it('三输入多数表决规范 SOP 含 m3,m5,m6,m7 四项', () => {
    // 000 001 010 011 100 101 110 111
    const table = tableFromOutputs(3, [0, 0, 0, 1, 0, 1, 1, 1]);
    const expr = extractSop(table, 0);
    expect(expr.minterms).toEqual([3, 5, 6, 7]);
    expect(expr.canonical).toBe("A'·B·C + A·B'·C + A·B·C' + A·B·C");
  });

  it('从真实电路提取的 SOP 与真值表保持一致', () => {
    // 电路：Y = A XOR B
    const circuit = {
      nodes: [
        { id: 'a', type: 'input' as const, x: 0, y: 0, label: 'A', value: 0 as const },
        { id: 'b', type: 'input' as const, x: 0, y: 60, label: 'B', value: 0 as const },
        { id: 'g', type: 'xor' as const, x: 150, y: 30 },
        { id: 'y', type: 'output' as const, x: 300, y: 30, label: 'Y' }
      ],
      edges: [
        { id: '1', source: 'a', target: 'g', inputPort: 0 },
        { id: '2', source: 'b', target: 'g', inputPort: 1 },
        { id: '3', source: 'g', target: 'y', inputPort: 0 }
      ]
    };
    const table = buildTruthTable(circuit);
    const [expr] = extractAllSop(table);
    expect(expr!.canonical).toBe("A'·B + A·B'");
    // 反验：对每个最小项按表达式里的文字取值模拟，结果必须等于该行输出
    for (const term of expr!.terms) {
      const m = term.minterm!;
      const inputs = table.rows[m]!.inputs;
      const value = term.literals.every((lit) => {
        if (lit.kind === 'const') return lit.value === 1;
        const idx = table.inputNames.indexOf(lit.name);
        return lit.negated ? inputs[idx] === 0 : inputs[idx] === 1;
      })
        ? 1
        : 0;
      expect(value).toBe(table.rows[m]!.outputs[0]);
    }
  });
});
