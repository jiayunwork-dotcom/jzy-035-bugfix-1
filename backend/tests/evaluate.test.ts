import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { findCycle, topologicalSort, validateCircuit } from '../src/graph.js';
import type { Circuit, CircuitEdge, CircuitNode } from '../src/types.js';

let seq = 0;
function nid(prefix: string) {
  seq += 1;
  return `${prefix}${seq}`;
}

function node(type: CircuitNode['type'], x: number, y: number, extra: Partial<CircuitNode> = {}): CircuitNode {
  return { id: nid('n'), type, x, y, ...extra };
}
function edge(source: string, target: string, inputPort = 0): CircuitEdge {
  return { id: nid('e'), source, target, inputPort };
}

describe('多级电路按拓扑传播', () => {
  it('输入 -> 与门 -> 指示灯，开关切换结果正确', () => {
    const a = node('input', 0, 0, { value: 1 });
    const b = node('input', 0, 80, { value: 0 });
    const g = node('and', 150, 40);
    const out = node('output', 300, 40);
    const circuit: Circuit = {
      nodes: [a, b, g, out],
      edges: [edge(a.id, g.id, 0), edge(b.id, g.id, 1), edge(g.id, out.id)]
    };

    let r = evaluate(circuit);
    expect(r.cyclic).toBe(false);
    expect(r.nodeValues[g.id]).toBe(0);
    expect(r.outputLights[out.id]).toBe(0);
    expect(r.edgeValues[circuit.edges[0]!.id]).toBe(1); // 第一根线仍传 1

    // 把 B 拨到 1，输出应变 1
    r = evaluate({ ...circuit, nodes: circuit.nodes.map((n) => (n.id === b.id ? { ...n, value: 1 } : n)) });
    expect(r.nodeValues[g.id]).toBe(1);
    expect(r.outputLights[out.id]).toBe(1);
    expect(r.edgeValues[circuit.edges[2]!.id]).toBe(1);
  });

  it('三级电路 ((A NAND B) XOR C) 逐级传播', () => {
    const a = node('input', 0, 0, { value: 1 });
    const b = node('input', 0, 70, { value: 1 });
    const c = node('input', 0, 140, { value: 1 });
    const nand = node('nand', 160, 35);
    const xor = node('xor', 320, 70);
    const out = node('output', 480, 70);
    const circuit: Circuit = {
      nodes: [a, b, c, nand, xor, out],
      edges: [
        edge(a.id, nand.id, 0),
        edge(b.id, nand.id, 1),
        edge(nand.id, xor.id, 0),
        edge(c.id, xor.id, 1),
        edge(xor.id, out.id)
      ]
    };
    // A=1,B=1 => NAND=0; C=1 => XOR(0,1)=1
    const r = evaluate(circuit);
    expect(r.nodeValues[nand.id]).toBe(0);
    expect(r.nodeValues[xor.id]).toBe(1);
    expect(r.outputLights[out.id]).toBe(1);

    // 拓扑序中输入必须在门之前
    const order = topologicalSort(circuit)!;
    expect(order.indexOf(nand.id)).toBeGreaterThan(order.indexOf(a.id));
    expect(order.indexOf(xor.id)).toBeGreaterThan(order.indexOf(nand.id));
    expect(order.indexOf(out.id)).toBeGreaterThan(order.indexOf(xor.id));
  });

  it('非门链：NOT NOT A = A', () => {
    const a = node('input', 0, 0, { value: 1 });
    const g1 = node('not', 120, 0);
    const g2 = node('not', 240, 0);
    const out = node('output', 360, 0);
    const circuit: Circuit = {
      nodes: [a, g1, g2, out],
      edges: [edge(a.id, g1.id), edge(g1.id, g2.id), edge(g2.id, out.id)]
    };
    const r = evaluate(circuit);
    expect(r.nodeValues[g1.id]).toBe(0);
    expect(r.nodeValues[g2.id]).toBe(1);
    expect(r.outputLights[out.id]).toBe(1);
  });

  it('悬空输入口按默认电平 0 处理，不报错', () => {
    const a = node('input', 0, 0, { value: 1 });
    const g = node('or', 150, 0);
    const out = node('output', 300, 0);
    const circuit: Circuit = {
      nodes: [a, g, out],
      edges: [edge(a.id, g.id, 0), edge(g.id, out.id)]
    };
    const r = evaluate(circuit);
    expect(r.nodeValues[g.id]).toBe(1);
  });
});

describe('反馈环检测', () => {
  it('两个非门首尾相连构成环：拓扑排序返回 null 且求值拒绝', () => {
    const g1 = node('not', 100, 0);
    const g2 = node('not', 250, 0);
    const out = node('output', 400, 0);
    const circuit: Circuit = {
      nodes: [g1, g2, out],
      edges: [
        edge(g1.id, g2.id, 0),
        edge(g2.id, g1.id, 0),
        edge(g2.id, out.id, 0)
      ]
    };
    expect(topologicalSort(circuit)).toBeNull();

    const cycle = findCycle(circuit);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(3); // g1 -> g2 -> g1
    expect(new Set(cycle)).toEqual(new Set([g1.id, g2.id]));

    const r = evaluate(circuit);
    expect(r.cyclic).toBe(true);
    expect(r.cycleNodeIds).toContain(g1.id);
    expect(r.cycleNodeIds).toContain(g2.id);
    // 绝不给出糊弄的数值：所有信号 unknown
    expect(Object.values(r.nodeValues).every((v) => v === 'unknown')).toBe(true);
    expect(Object.values(r.edgeValues).every((v) => v === 'unknown')).toBe(true);
    expect(r.outputLights[out.id]).toBeUndefined();
  });

  it('输出绕回自身输入的自环也被拒绝', () => {
    const g = node('not', 100, 0);
    const circuit: Circuit = {
      nodes: [g],
      edges: [{ id: 'self', source: g.id, target: g.id, inputPort: 0 }]
    };
    // 结构校验先报自环
    const issues = validateCircuit(circuit);
    expect(issues.some((i) => i.code === 'SELF_LOOP')).toBe(true);
  });

  it('无环电路 findCycle 返回 null', () => {
    const a = node('input', 0, 0, { value: 0 });
    const g = node('and', 100, 0);
    const circuit: Circuit = { nodes: [a, g], edges: [edge(a.id, g.id, 0)] };
    expect(findCycle(circuit)).toBeNull();
  });
});

describe('连线方向约束', () => {
  it('线接到输入开关（其没有输入口）被拒绝', () => {
    const a = node('input', 0, 0, { value: 0 });
    const b = node('input', 100, 0, { value: 1 });
    const circuit: Circuit = { nodes: [a, b], edges: [edge(a.id, b.id, 0)] };
    const issues = validateCircuit(circuit);
    expect(issues.some((i) => i.code === 'PORT_CONFLICT')).toBe(true);
  });

  it('两条线接到同一个输入口被拒绝', () => {
    const a = node('input', 0, 0, { value: 1 });
    const b = node('input', 0, 80, { value: 1 });
    const g = node('and', 150, 40);
    const circuit: Circuit = {
      nodes: [a, b, g],
      edges: [edge(a.id, g.id, 0), edge(b.id, g.id, 0)]
    };
    expect(validateCircuit(circuit).some((i) => i.code === 'DUPLICATE_EDGE')).toBe(true);
  });

  it('输入口索引越界被拒绝', () => {
    const a = node('input', 0, 0, { value: 1 });
    const g = node('not', 150, 0);
    const circuit: Circuit = { nodes: [a, g], edges: [edge(a.id, g.id, 3)] };
    expect(validateCircuit(circuit).some((i) => i.code === 'PORT_OUT_OF_RANGE')).toBe(true);
  });
});
