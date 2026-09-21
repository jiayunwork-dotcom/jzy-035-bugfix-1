import { inputPortCount } from './geometry';
import type {
  Bit,
  Circuit,
  CircuitEdge,
  CircuitNode,
  GateType
} from './types';
import { uid } from './geometry';

/** 深拷贝电路（结构简单，JSON 即可；value 是 0/1 字面量安全） */
export function cloneCircuit(c: Circuit): Circuit {
  return {
    nodes: c.nodes.map((n) => ({ ...n })),
    edges: c.edges.map((e) => ({ ...e }))
  };
}

/** 新增元件，自动按同类元件个数给默认标签（A,B,C… / Y,Z… / 门不命名） */
export function addNode(
  circuit: Circuit,
  type: GateType,
  x: number,
  y: number
): Circuit {
  const node: CircuitNode = {
    id: uid(type),
    type,
    x: Math.round(x),
    y: Math.round(y)
  };
  if (type === 'input') {
    node.value = 0;
    node.label = nextIOLabel(circuit, 'input');
  } else if (type === 'output') {
    node.label = nextIOLabel(circuit, 'output');
  }
  return { nodes: [...circuit.nodes, node], edges: circuit.edges };
}

function nextIOLabel(circuit: Circuit, type: 'input' | 'output'): string {
  const used = new Set(
    circuit.nodes
      .filter((n) => n.type === type && n.label)
      .map((n) => n.label!)
  );
  const alphabet = type === 'input' ? 'ABCDEFGHIJKLMNOPQRSTUVW' : 'YZ';
  for (const ch of alphabet) {
    if (!used.has(ch)) return ch;
  }
  return type === 'input' ? `X${circuit.nodes.length + 1}` : `F${circuit.nodes.length + 1}`;
}

export function moveNode(
  circuit: Circuit,
  id: string,
  x: number,
  y: number
): Circuit {
  return {
    nodes: circuit.nodes.map((n) =>
      n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n
    ),
    edges: circuit.edges
  };
}

export function renameNode(
  circuit: Circuit,
  id: string,
  label: string
): Circuit {
  return {
    nodes: circuit.nodes.map((n) =>
      n.id === id ? { ...n, label: label.trim() || undefined } : n
    ),
    edges: circuit.edges
  };
}

export function deleteSelection(
  circuit: Circuit,
  nodeIds: Set<string>
): Circuit {
  return {
    nodes: circuit.nodes.filter((n) => !nodeIds.has(n.id)),
    edges: circuit.edges.filter(
      (e) => !nodeIds.has(e.source) && !nodeIds.has(e.target)
    )
  };
}

export function toggleSwitch(circuit: Circuit, id: string): Circuit {
  return {
    nodes: circuit.nodes.map((n) =>
      n.id === id && n.type === 'input'
        ? { ...n, value: ((n.value ?? 0) ^ 1) as Bit }
        : n
    ),
    edges: circuit.edges
  };
}

export function setSwitch(circuit: Circuit, id: string, value: Bit): Circuit {
  return {
    nodes: circuit.nodes.map((n) =>
      n.id === id && n.type === 'input' ? { ...n, value } : n
    ),
    edges: circuit.edges
  };
}

export function deleteEdge(circuit: Circuit, id: string): Circuit {
  return { nodes: circuit.nodes, edges: circuit.edges.filter((e) => e.id !== id) };
}

export interface ConnectCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 连线合法性（与后端 validateCircuit 的规则一致，前端先做即时反馈）：
 * - 只能输出口 -> 输入口（源不能是 output 灯、目标不能是 input 开关）；
 * - 目标输入口索引必须在端口范围内；
 * - 不能接自己、不能重复驱动同一输入口。
 */
export function canConnect(
  circuit: Circuit,
  sourceId: string,
  targetId: string,
  inputPort: number
): ConnectCheck {
  const src = circuit.nodes.find((n) => n.id === sourceId);
  const dst = circuit.nodes.find((n) => n.id === targetId);
  if (!src || !dst) return { ok: false, reason: '元件不存在' };
  if (dst.type === 'input')
    return { ok: false, reason: '不能接到输入开关上（它只有输出口）' };
  if (inputPort < 0 || inputPort >= inputPortCount(dst.type))
    return { ok: false, reason: '目标输入口不存在' };
  if (sourceId === targetId) return { ok: false, reason: '不能接回自己' };
  if (
    circuit.edges.some(
      (e) => e.target === targetId && e.inputPort === inputPort
    )
  )
    return { ok: false, reason: '这个输入口已经接了线' };
  return { ok: true };
}

export function connect(
  circuit: Circuit,
  sourceId: string,
  targetId: string,
  inputPort: number
): Circuit {
  const edge: CircuitEdge = {
    id: uid('w'),
    source: sourceId,
    target: targetId,
    inputPort
  };
  return { nodes: circuit.nodes, edges: [...circuit.edges, edge] };
}

/** 序列化 / 反序列化（含基本容错） */
export function serialize(circuit: Circuit): string {
  return JSON.stringify(circuit, null, 2);
}

export function deserialize(text: string): Circuit {
  const data = JSON.parse(text) as Circuit;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('文件内容不是合法的电路存档（缺少 nodes/edges）');
  }
  return {
    nodes: data.nodes.map((n) => ({
      id: String(n.id),
      type: n.type,
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      label: n.label,
      value: n.value === 1 ? 1 : 0
    })),
    edges: data.edges.map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      inputPort: Number(e.inputPort) || 0
    }))
  };
}

/** 新建空电路 */
export function emptyCircuit(): Circuit {
  return { nodes: [], edges: [] };
}
