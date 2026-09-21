import { inputPortCount } from './gates.js';
import type { Circuit, CircuitEdge, CircuitNode, GateType } from './types.js';

export interface ValidatedCircuit {
  nodes: Map<string, CircuitNode>;
  /** 每个元件的入边（按输入口可索引） */
  incoming: Map<string, CircuitEdge[]>;
  /** 每个元件的出边 */
  outgoing: Map<string, CircuitEdge[]>;
}

export interface ValidationIssue {
  code:
    | 'DUPLICATE_EDGE'
    | 'PORT_CONFLICT'
    | 'PORT_OUT_OF_RANGE'
    | 'SELF_LOOP'
    | 'UNKNOWN_NODE';
  message: string;
  edgeId?: string;
}

/**
 * 结构校验：检查连线引用的元件是否存在、输入口是否合法、
 * 是否有两条线接到同一个输入口、输出口-输出口 / 输入口-输入口直连等。
 *
 * 连线合法性（只能 输出口 -> 输入口）由 source/target 元件类型与端口方向天然保证：
 * 源元件必须有输出口（所有元件都有），目标元件必须有 >=1 个输入口，
 * 且 inputPort 落在其输入口范围内 —— 因此“输出接输出、输入接输入”都会在这里被拒。
 */
export function validateCircuit(circuit: Circuit): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = new Map<string, CircuitNode>();
  for (const n of circuit.nodes) nodes.set(n.id, n);

  const seen = new Set<string>();
  for (const e of circuit.edges) {
    const src = nodes.get(e.source);
    const dst = nodes.get(e.target);
    if (!src || !dst) {
      issues.push({
        code: 'UNKNOWN_NODE',
        edgeId: e.id,
        message: `连线 ${e.id} 引用了不存在的元件`
      });
      continue;
    }

    const dstPortCount = inputPortCount(dst.type);
    if (dstPortCount === 0) {
      // 目标是输入开关（只有输出口）——相当于“往输入口里接线接到了输出口”，拒绝
      issues.push({
        code: 'PORT_CONFLICT',
        edgeId: e.id,
        message: `连线 ${e.id} 接到了输入开关上（只能从它的输出口往外接）`
      });
      continue;
    }
    if (e.inputPort < 0 || e.inputPort >= dstPortCount) {
      issues.push({
        code: 'PORT_OUT_OF_RANGE',
        edgeId: e.id,
        message: `连线 ${e.id} 的目标输入口 ${e.inputPort} 越界（${dst.type} 有 ${dstPortCount} 个输入口）`
      });
      continue;
    }
    if (e.source === e.target) {
      issues.push({
        code: 'SELF_LOOP',
        edgeId: e.id,
        message: `元件 ${src.label ?? src.id} 的输出不能直接接回自己的输入`
      });
      continue;
    }

    // 同一输入口只允许一条驱动线
    const key = `${e.target}#${e.inputPort}`;
    if (seen.has(key)) {
      issues.push({
        code: 'DUPLICATE_EDGE',
        edgeId: e.id,
        message: `元件 ${dst.label ?? dst.id} 的第 ${e.inputPort + 1} 个输入口已被占用`
      });
      continue;
    }
    seen.add(key);
  }
  return issues;
}

/** 建立邻接索引（已假定结构基本合法；非法边会被忽略） */
export function buildIndex(circuit: Circuit): ValidatedCircuit {
  const nodes = new Map<string, CircuitNode>();
  for (const n of circuit.nodes) nodes.set(n.id, n);

  const incoming = new Map<string, CircuitEdge[]>();
  const outgoing = new Map<string, CircuitEdge[]>();
  for (const id of nodes.keys()) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }

  const validIssues = validateCircuit(circuit);
  const badEdgeIds = new Set(validIssues.map((i) => i.edgeId));
  for (const e of circuit.edges) {
    if (badEdgeIds.has(e.id)) continue;
    incoming.get(e.target)?.push(e);
    outgoing.get(e.source)?.push(e);
  }

  return { nodes, incoming, outgoing };
}

/**
 * Kahn 拓扑排序。返回 null 表示存在反馈环。
 * 输入开关天然入度为 0，会排在最前面。
 */
export function topologicalSort(circuit: Circuit): string[] | null {
  const { nodes, incoming, outgoing } = buildIndex(circuit);
  const indegree = new Map<string, number>();
  for (const id of nodes.keys()) indegree.set(id, incoming.get(id)!.length);

  // 用 id 排序让结果稳定，便于测试
  const queue: string[] = [];
  for (const [id, d] of indegree) if (d === 0) queue.push(id);
  queue.sort();

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outgoing.get(id) ?? []) {
      const d = (indegree.get(e.target) ?? 1) - 1;
      indegree.set(e.target, d);
      if (d === 0) {
        queue.push(e.target);
        queue.sort();
      }
    }
  }

  return order.length === nodes.size ? order : null;
}

/**
 * 用 DFS 三色法找出一个具体的反馈环，用于给用户报告
 * “是哪些元件绕成了环”。
 */
export function findCycle(circuit: Circuit): string[] | null {
  const { nodes } = buildIndex(circuit);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodes.keys()) color.set(id, WHITE);

  const parent = new Map<string, string | null>();
  const adj = (id: string) =>
    circuit.edges.filter((e) => e.source === id && nodes.has(e.target)).map((e) => e.target);

  const dfs = (start: string): string[] | null => {
    color.set(start, GRAY);
    // 稳定遍历顺序
    const neighbors = [...adj(start)].sort();
    for (const next of neighbors) {
      if (color.get(next) === GRAY) {
        // 回溯出环：next ... start -> next
        const cycle = [next];
        let cur: string | null = start;
        while (cur && cur !== next) {
          cycle.push(cur);
          cur = parent.get(cur) ?? null;
        }
        cycle.push(next);
        cycle.reverse();
        return cycle;
      }
      if (color.get(next) === WHITE) {
        parent.set(next, start);
        const found = dfs(next);
        if (found) return found;
      }
    }
    color.set(start, BLACK);
    return null;
  };

  for (const id of [...nodes.keys()].sort()) {
    if (color.get(id) === WHITE) {
      parent.set(id, null);
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function sortByPosition<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const na = a as unknown as CircuitNode;
    const nb = b as unknown as CircuitNode;
    if (na.x !== nb.x) return na.x - nb.x;
    return na.y - nb.y;
  });
}

export function isGate(type: GateType): boolean {
  return type !== 'input' && type !== 'output';
}
