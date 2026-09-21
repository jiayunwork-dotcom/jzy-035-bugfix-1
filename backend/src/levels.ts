import { evaluate } from './evaluate.js';
import { buildTruthTable } from './truthTable.js';
import type { Bit, Circuit, Level, VerifyResult } from './types.js';

/**
 * 内置教学关卡。目标真值表按输入组合二进制递增排列
 * （第 0 个变量为最高位），与 buildTruthTable 的行顺序一致。
 */
export const LEVELS: Level[] = [
  {
    id: 'not-gate',
    name: '第 1 关：反相器',
    description: '用一个非门，让输出等于输入的反：Y = A′。',
    inputCount: 1,
    outputCount: 1,
    inputNames: ['A'],
    outputNames: ['Y'],
    expected: [[1], [0]],
    hint: '非门的输出端有一个表示取反的小圆圈。'
  },
  {
    id: 'and2',
    name: '第 2 关：二输入与门',
    description: '只有两个输入都为 1 时输出才为 1：Y = A·B。',
    inputCount: 2,
    outputCount: 1,
    inputNames: ['A', 'B'],
    outputNames: ['Y'],
    expected: [[0], [0], [0], [1]],
    hint: '与门矩形框里写着 &。'
  },
  {
    id: 'xor2',
    name: '第 3 关：二输入异或',
    description: '两个输入不同时输出 1：Y = A⊕B。',
    inputCount: 2,
    outputCount: 1,
    inputNames: ['A', 'B'],
    outputNames: ['Y'],
    expected: [[0], [1], [1], [0]],
    hint: '可以直接用异或门（=1），也可以用与/或/非门拼出来。'
  },
  {
    id: 'majority3',
    name: '第 4 关：三输入多数表决',
    description: '三个输入中多数（两个及以上）为 1 时输出 1。',
    inputCount: 3,
    outputCount: 1,
    inputNames: ['A', 'B', 'C'],
    outputNames: ['Y'],
    // 000..111
    expected: [[0], [0], [0], [1], [0], [1], [1], [1]],
    hint: '最简表达式 Y = A·B + A·C + B·C，做完可以看看卡诺图的三个圈。'
  },
  {
    id: 'xnor3-parity',
    name: '第 5 关：三输入偶校验',
    description: '三个输入中 1 的个数为偶数（含 0 个）时输出 1：Y = A⊙B⊙C。',
    inputCount: 3,
    outputCount: 1,
    inputNames: ['A', 'B', 'C'],
    outputNames: ['Y'],
    expected: [[1], [0], [0], [1], [0], [1], [1], [0]],
    hint: '三个变量做同或（异或非）；两级异或门再接一个非门即可。'
  }
];

export function getLevel(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

/**
 * 关卡验证：必须用同一套真实求值内核穷举学生电路的真值表，
 * 与目标一行行比较。绝不按电路结构相似度放行。
 */
export function verifyCircuit(circuit: Circuit, level: Level): VerifyResult {
  const inputs = circuit.nodes.filter((n) => n.type === 'input');
  const outputs = circuit.nodes.filter((n) => n.type === 'output');

  if (inputs.length !== level.inputCount) {
    return {
      levelId: level.id,
      passed: false,
      evaluable: false,
      mismatches: [],
      message: `本关需要恰好 ${level.inputCount} 个输入开关，当前电路有 ${inputs.length} 个`
    };
  }
  if (outputs.length !== level.outputCount) {
    return {
      levelId: level.id,
      passed: false,
      evaluable: false,
      mismatches: [],
      message: `本关需要恰好 ${level.outputCount} 个输出指示灯，当前电路有 ${outputs.length} 个`
    };
  }

  let table;
  try {
    table = buildTruthTable(circuit);
  } catch (err) {
    return {
      levelId: level.id,
      passed: false,
      evaluable: false,
      mismatches: [],
      message: err instanceof Error ? err.message : '电路无法求值'
    };
  }

  // 环检测（buildTruthTable 已覆盖，这里再显式走一次求值以拿到明确结论）
  const probe = evaluate(circuit);
  if (probe.cyclic) {
    return {
      levelId: level.id,
      passed: false,
      evaluable: false,
      mismatches: [],
      message: probe.message ?? '电路存在反馈环'
    };
  }

  const mismatches: VerifyResult['mismatches'] = [];
  level.expected.forEach((expectedRow, row) => {
    const actual = table.rows[row]?.outputs ?? [];
    for (let o = 0; o < level.outputCount; o++) {
      if (actual[o] !== expectedRow[o]) {
        mismatches.push({
          row,
          inputs: table.rows[row]!.inputs,
          expected: expectedRow as Bit[],
          actual: actual as Bit[]
        });
        break;
      }
    }
  });

  const passed = mismatches.length === 0;
  return {
    levelId: level.id,
    passed,
    evaluable: true,
    mismatches: mismatches.slice(0, 32),
    message: passed
      ? `完全正确！真值表全部 ${level.expected.length} 行都与目标一致，过关！`
      : `还没过：真值表有 ${mismatches.length} 行和目标不一样，根据下面的对照表再改改`
  };
}
