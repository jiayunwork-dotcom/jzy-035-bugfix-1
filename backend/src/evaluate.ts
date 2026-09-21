import { computeGate, inputPortCount } from './gates.js';
import { buildIndex, findCycle, topologicalSort } from './graph.js';
import type { Bit, Circuit, EvaluateResult, Signal } from './types.js';

/** 悬空输入口（没有任何线驱动）时采用的默认电平 */
export const FLOATING_INPUT: Bit = 0;

/**
 * 对电路进行一次完整求值。
 *
 * 求值严格建立在拓扑排序上：输入开关排在最前，之后按拓扑顺序
 * 一级级向后传播，每个门读取其各输入口驱动线的信号，算出自己的输出。
 *
 * 若电路中存在反馈环（组合电路不允许），不进行任何猜测性求值：
 * - cyclic = true，并通过 findCycle 给出环上元件；
 * - 所有信号标记为 unknown（前端画成虚线），绝不返回可能误导学生的数值。
 */
export function evaluate(circuit: Circuit): EvaluateResult {
  const order = topologicalSort(circuit);
  if (order === null) {
    const cycleNodeIds = findCycle(circuit) ?? [];
    const nodeValues: Record<string, Signal> = {};
    const edgeValues: Record<string, Signal> = {};
    for (const n of circuit.nodes) nodeValues[n.id] = 'unknown';
    for (const e of circuit.edges) edgeValues[e.id] = 'unknown';
    return {
      nodeValues,
      edgeValues,
      outputLights: {},
      cyclic: true,
      cycleNodeIds,
      message:
        cycleNodeIds.length > 0
          ? '检测到反馈环：组合逻辑电路不允许信号绕回自身（这是时序电路/锁存器的特征）'
          : '检测到反馈环，无法按组合逻辑求值'
    };
  }

  const { nodes, incoming } = buildIndex(circuit);
  const nodeValues: Record<string, Signal> = {};
  const edgeValues: Record<string, Signal> = {};
  const outputLights: Record<string, Bit> = {};

  for (const id of order) {
    const node = nodes.get(id)!;
    switch (node.type) {
      case 'input':
        nodeValues[id] = node.value ?? 0;
        break;
      case 'output': {
        // 指示灯：透传其唯一输入口上的信号（悬空默认 0）
        const edge = incoming.get(id)?.find((e) => e.inputPort === 0);
        const v = edge ? (nodeValues[edge.source] as Bit) : FLOATING_INPUT;
        nodeValues[id] = v;
        outputLights[id] = v;
        break;
      }
      default: {
        const portCount = inputPortCount(node.type);
        const inputs: Bit[] = [];
        for (let p = 0; p < portCount; p++) {
          const edge = incoming.get(id)?.find((e) => e.inputPort === p);
          inputs.push(edge ? (nodeValues[edge.source] as Bit) : FLOATING_INPUT);
        }
        nodeValues[id] = computeGate(node.type, inputs);
      }
    }
  }

  // 每根线携带其源元件输出的信号
  for (const e of circuit.edges) {
    edgeValues[e.id] = nodeValues[e.source] ?? 'unknown';
  }

  return { nodeValues, edgeValues, outputLights, cyclic: false };
}
