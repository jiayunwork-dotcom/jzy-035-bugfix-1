import React from 'react';
import { inputPortPos, outputPortPos, pointsToPath, routePoints } from '../geometry';
import type { Circuit, CircuitEdge, CircuitNode, Signal } from '../types';
import { SIGNAL_COLORS } from './GateView';

interface WireViewProps {
  edge: CircuitEdge;
  source: CircuitNode;
  target: CircuitNode;
  signal: Signal;
  selected: boolean;
  onSelect: (e: React.PointerEvent, edgeId: string) => void;
}

/**
 * 一条已完成的连线：横平竖直的曼哈顿折线。
 * 颜色跟信号：1 红、0 蓝、未算出（有环时）灰色虚线。
 * 较宽的透明描边盖在底下，方便点选。
 */
export function WireView({ edge, source, target, signal, selected, onSelect }: WireViewProps) {
  const from = outputPortPos(source);
  const to = inputPortPos(target, edge.inputPort);
  const d = pointsToPath(routePoints(from, to));

  const color =
    signal === 'unknown'
      ? SIGNAL_COLORS.unknown
      : signal === 1
        ? SIGNAL_COLORS.one
        : SIGNAL_COLORS.zero;
  const dash = signal === 'unknown' ? '7 6' : undefined;

  return (
    <g>
      <path d={d} className="wire-hit" onPointerDown={(e) => onSelect(e, edge.id)} />
      <path
        d={d}
        className={`wire ${selected ? 'wire-selected' : ''}`}
        style={{ stroke: color, strokeDasharray: dash }}
      />
    </g>
  );
}

interface PendingWireProps {
  circuit: Circuit;
  sourceId: string;
  pointer: { x: number; y: number };
  valid: boolean;
}

/** 正在拉、还没落下的线：跟着鼠标走，合法目标为绿色、非法为灰红 */
export function PendingWire({ circuit, sourceId, pointer, valid }: PendingWireProps) {
  const source = circuit.nodes.find((n) => n.id === sourceId);
  if (!source) return null;
  const from = outputPortPos(source);
  const d = pointsToPath(routePoints(from, pointer));
  return (
    <path
      d={d}
      className={`wire wire-pending ${valid ? 'pending-valid' : 'pending-invalid'}`}
    />
  );
}
