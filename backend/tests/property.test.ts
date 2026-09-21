import { describe, expect, it } from 'vitest';
import { buildTruthTable, extractSop } from '../src/truthTable.js';
import { buildKarnaughMap } from '../src/karnaugh.js';
import type { Bit, Circuit } from '../src/types.js';

/** 随机多级电路（保证无环：边只从靠前的元件指向靠后的元件） */
function randomCircuit(nInputs: number, seed: number): Circuit {
  let s = seed;
  const rand = () => {
    // 确定性 LCG，保证测试可复现
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
  const gates: Circuit['nodes'] = [];
  const inputs = Array.from({ length: nInputs }, (_, i) => ({
    id: `x${i}`,
    type: 'input' as const,
    x: 0,
    y: i * 40,
    label: ['A', 'B', 'C', 'D'][i],
    value: 0 as Bit
  }));

  const pool: { id: string }[] = [...inputs];
  const gateTypes = ['and', 'or', 'nand', 'nor', 'xor', 'xnor'] as const;
  for (let g = 0; g < 6; g++) {
    const id = `t${g}`;
    const type = gateTypes[Math.floor(rand() * gateTypes.length)]!;
    gates.push({ id, type, x: 200 + g * 120, y: g * 50 });
    pool.push({ id });
  }
  const output = { id: 'y', type: 'output' as const, x: 1000, y: 100, label: 'Y' };

  const edges: Circuit['edges'] = [];
  let eid = 0;
  // 每个门两个输入，只能从“更靠前”的池子里挑，保证 DAG
  gates.forEach((gate, gi) => {
    const candidates = pool.slice(0, nInputs + gi);
    const i1 = candidates[Math.floor(rand() * candidates.length)]!;
    let i2 = candidates[Math.floor(rand() * candidates.length)]!;
    if (candidates.length > 1 && i2.id === i1.id) {
      i2 = candidates.find((c) => c.id !== i1.id)!;
    }
    edges.push({ id: `e${eid++}`, source: i1.id, target: gate.id, inputPort: 0 });
    if (i2.id !== i1.id) {
      edges.push({ id: `e${eid++}`, source: i2.id, target: gate.id, inputPort: 1 });
    }
  });
  edges.push({ id: 'eout', source: gates[gates.length - 1]!.id, target: 'y', inputPort: 0 });

  return { nodes: [...inputs, ...gates, output], edges };
}

describe('性质测试：SOP / 卡诺图对任意随机电路都与真值表一致', () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`随机电路 seed=${seed}（2~4 变量）`, () => {
      const nVars = 2 + (seed % 3); // 2,3,4
      const circuit = randomCircuit(nVars, seed * 97 + 13);
      const table = buildTruthTable(circuit);
      const sop = extractSop(table, 0);

      // 1) SOP 的最小项集合 == 真值表输出为 1 的行集合（恒 0/恒 1 单独处理）
      const oneRows = table.rows
        .map((r, i) => (r.outputs[0] === 1 ? i : -1))
        .filter((i) => i >= 0);

      if (sop.constant !== undefined) {
        // 恒 0 / 恒 1：每一行都必须等于该常量
        for (const row of table.rows) expect(row.outputs[0]).toBe(sop.constant);
        const km = buildKarnaughMap(table, 0);
        expect(km.constant).toBe(sop.constant);
        expect(km.simplified).toBe(String(sop.constant));
        return;
      }

      expect([...sop.minterms].sort((a, b) => a - b)).toEqual([...oneRows].sort((a, b) => a - b));

      // 2) 每个最小项只在它自己那一行取值为 1，在其他行必为 0
      table.rows.forEach((row, m) => {
        const own = sop.terms.find((t) => t.minterm === m);
        if (own) {
          // 自己的最小项：所有文字都与本行取值吻合
          const matches = own.literals.every((lit) => {
            const idx = table.inputNames.indexOf(lit.name!);
            const v = row.inputs[idx]!;
            return lit.negated ? v === 0 : v === 1;
          });
          expect(matches).toBe(true);
        }
        for (const t of sop.terms) {
          if (t.minterm === m) continue;
          const allMatch = t.literals.every((lit) => {
            const idx = table.inputNames.indexOf(lit.name!);
            const v = row.inputs[idx]!;
            return lit.negated ? v === 0 : v === 1;
          });
          expect(allMatch).toBe(false);
        }
      });

      // 3) 卡诺图质蕴含项：覆盖全部 1 格，且圈里不包含任何 0 格
      const km = buildKarnaughMap(table, 0);
      const covered = new Set<number>();
      km.groups.forEach((g) => g.minterms.forEach((m) => covered.add(m)));
      for (const m of oneRows) expect(covered.has(m)).toBe(true);
      const zeroRows = new Set(
        table.rows.map((r, i) => (r.outputs[0] === 0 ? i : -1)).filter((i) => i >= 0)
      );
      km.groups.forEach((g) => {
        g.minterms.forEach((m) => expect(zeroRows.has(m)).toBe(false));
      });
    });
  }
});
