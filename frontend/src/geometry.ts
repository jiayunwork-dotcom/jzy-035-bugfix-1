import type { CircuitNode, GateType } from './types';

/**
 * 画布几何：所有坐标都在“世界坐标系”里，缩放和平移只改变视图变换。
 * 门统一采用 IEC 矩形符号：宽 64、高随输入口数，左进右出。
 */

export const GATE_WIDTH = 64;
export const PORT_GAP = 26;
export const PORT_RADIUS = 6;
export const BUBBLE_RADIUS = 5;

export function gateHeight(type: GateType): number {
  switch (type) {
    case 'input':
    case 'output':
      return 40;
    case 'not':
      return 44;
    default:
      return 2 * PORT_GAP + 8; // 60
  }
}

export function inputPortCount(type: GateType): number {
  switch (type) {
    case 'input':
      return 0;
    case 'output':
    case 'not':
      return 1;
    default:
      return 2;
  }
}

export interface Point {
  x: number;
  y: number;
}

/** 某元件输出口（右侧）的世界坐标；带取反小圆圈的门，口在圆圈外侧 */
export function outputPortPos(node: CircuitNode): Point {
  const offset =
    node.type === 'nand' || node.type === 'nor' || node.type === 'xnor' || node.type === 'not'
      ? BUBBLE_RADIUS * 2
      : 0;
  return { x: node.x + GATE_WIDTH + offset, y: node.y + gateHeight(node.type) / 2 };
}

/** 某元件第 port 个输入口（左侧）的世界坐标 */
export function inputPortPos(node: CircuitNode, port: number): Point {
  const count = inputPortCount(node.type);
  const usable = gateHeight(node.type) - 16;
  const y =
    count === 1
      ? node.y + gateHeight(node.type) / 2
      : node.y + 8 + (usable / (count - 1)) * port;
  return { x: node.x, y };
}

/** 视图变换：世界坐标 <-> 屏幕坐标 */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

export function screenToWorld(p: Point, vt: ViewTransform): Point {
  return { x: (p.x - vt.tx) / vt.scale, y: (p.y - vt.ty) / vt.scale };
}

/**
 * 输出口 -> 输入口的曼哈顿折线：
 * 先走 12px 水平引出，再竖直到目标高度，最后水平进入输入口。
 */
export function manhattanPath(from: Point, to: Point): string {
  const lead = 16;
  const midX = Math.max(from.x + lead, to.x - lead - 8);
  return [
    `M ${from.x} ${from.y}`,
    `L ${midX} ${from.y}`,
    `L ${midX} ${to.y}`,
    `L ${to.x - (to.x > from.x ? 0 : 0)} ${to.y}`
  ].join(' ');
}

/** 简单正交折线（直接三段），供实时拖拽预览复用 */
export function routePoints(from: Point, to: Point): { x: number; y: number }[] {
  const lead = 16;
  const midX = Math.max(from.x + lead, to.x - lead);
  return [
    from,
    { x: midX, y: from.y },
    { x: midX, y: to.y },
    to
  ];
}

export function pointsToPath(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
}

/** 命中测试：点是否落在元件矩形内（含少量容差） */
export function hitNode(node: CircuitNode, p: Point, pad = 4): boolean {
  const h = gateHeight(node.type);
  return (
    p.x >= node.x - pad &&
    p.x <= node.x + GATE_WIDTH + pad &&
    p.y >= node.y - pad &&
    p.y <= node.y + h + pad
  );
}

/** 命中输入口：返回端口索引，否则 null */
export function hitInputPort(
  node: CircuitNode,
  p: Point
): number | null {
  const count = inputPortCount(node.type);
  for (let i = 0; i < count; i++) {
    const pos = inputPortPos(node, i);
    if (Math.hypot(pos.x - p.x, pos.y - p.y) <= PORT_RADIUS + 6) return i;
  }
  return null;
}

/** 门矩形框里印的 IEC 符号 */
export const GATE_SYMBOLS: Partial<Record<GateType, string>> = {
  and: '&',
  or: '≥1',
  not: '1',
  nand: '&',
  nor: '≥1',
  xor: '=1',
  xnor: '=1'
};

export function hasOutputBubble(type: GateType): boolean {
  return type === 'nand' || type === 'nor' || type === 'xnor';
}

/** 生成唯一 id（优先用浏览器原生 crypto.randomUUID） */
export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
