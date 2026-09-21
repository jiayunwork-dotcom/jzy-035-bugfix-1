import React from 'react';
import {
  BUBBLE_RADIUS,
  GATE_SYMBOLS,
  GATE_WIDTH,
  gateHeight,
  hasOutputBubble,
  inputPortCount,
  inputPortPos,
  outputPortPos,
  PORT_RADIUS
} from '../geometry';
import type { CircuitNode, Signal } from '../types';

export const SIGNAL_COLORS: Record<'one' | 'zero' | 'unknown', string> = {
  one: '#e5484d', // 传 1：红色（高电平）
  zero: '#3e7bfa', // 传 0：蓝色（低电平）
  unknown: '#8a8f99' // 未算出：灰虚线
};

interface GateViewProps {
  node: CircuitNode;
  selected: boolean;
  highlightedCycle: boolean;
  outputSignal: Signal;
  /** 当前连线拖拽悬停的目标输入口（高亮绿色） */
  hoverPort: number | null;
  onPointerDownBody: (e: React.PointerEvent, node: CircuitNode) => void;
  onPointerDownOutput: (e: React.PointerEvent, node: CircuitNode) => void;
  onPointerEnterPort: (node: CircuitNode, port: number) => void;
  onPointerLeavePort: () => void;
  onClickSwitch: (node: CircuitNode) => void;
}

/**
 * 单个元件的 SVG 呈现。统一 IEC 矩形符号：
 * & 与、≥1 或、1 缓冲/非、=1 异或；取反在输出端画小圆圈。
 */
export function GateView({
  node,
  selected,
  highlightedCycle,
  outputSignal,
  hoverPort,
  onPointerDownBody,
  onPointerDownOutput,
  onPointerEnterPort,
  onPointerLeavePort,
  onClickSwitch
}: GateViewProps) {
  const h = gateHeight(node.type);

  if (node.type === 'input') {
    const on = node.value === 1;
    return (
      <g>
        <rect
          x={node.x}
          y={node.y}
          width={GATE_WIDTH}
          height={h}
          rx={8}
          className={`gate switch ${on ? 'switch-on' : ''} ${selected ? 'selected' : ''}`}
          onPointerDown={(e) => onPointerDownBody(e, node)}
        />
        <text
          x={node.x + 16}
          y={node.y + h / 2 + 5}
          className="gate-label"
          onPointerDown={(e) => onPointerDownBody(e, node)}
        >
          {node.label ?? '?'}
        </text>
        {/* 开关拨片：点击切换 0/1，也可从输出口拉线 */}
        <circle
          cx={node.x + 42}
          cy={node.y + h / 2}
          r={11}
          className={`switch-knob ${on ? 'knob-on' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => {
            e.stopPropagation();
            onClickSwitch(node);
          }}
        />
        <OutputPort node={node} signal={outputSignal} onPointerDown={onPointerDownOutput} />
      </g>
    );
  }

  if (node.type === 'output') {
    const on = outputSignal === 1;
    return (
      <g>
        <rect
          x={node.x}
          y={node.y}
          width={GATE_WIDTH}
          height={h}
          rx={8}
          className={`gate lamp ${on ? 'lamp-on' : ''} ${selected ? 'selected' : ''} ${highlightedCycle ? 'cycle-hit' : ''}`}
          onPointerDown={(e) => onPointerDownBody(e, node)}
        />
        <circle
          cx={node.x + 20}
          cy={node.y + h / 2}
          r={10}
          className={`lamp-bulb ${on ? 'bulb-on' : ''}`}
        />
        <text x={node.x + 38} y={node.y + h / 2 + 5} className="gate-label">
          {node.label ?? 'Y'}
        </text>
        {Array.from({ length: inputPortCount(node.type) }, (_, p) => (
          <InputPort
            key={p}
            node={node}
            port={p}
            hovered={hoverPort === p}
            onEnter={onPointerEnterPort}
            onLeave={onPointerLeavePort}
          />
        ))}
      </g>
    );
  }

  // 通用门
  const symbol = GATE_SYMBOLS[node.type] ?? '';
  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={GATE_WIDTH}
        height={h}
        className={`gate gate-box ${selected ? 'selected' : ''} ${highlightedCycle ? 'cycle-hit' : ''}`}
        onPointerDown={(e) => onPointerDownBody(e, node)}
      />
      <text
        x={node.x + GATE_WIDTH / 2 - 6}
        y={node.y + h / 2 + 6}
        className="gate-symbol"
        onPointerDown={(e) => onPointerDownBody(e, node)}
      >
        {symbol}
      </text>
      {Array.from({ length: inputPortCount(node.type) }, (_, p) => (
        <InputPort
          key={p}
          node={node}
          port={p}
          hovered={hoverPort === p}
          onEnter={onPointerEnterPort}
          onLeave={onPointerLeavePort}
        />
      ))}
      {hasOutputBubble(node.type) && (
        <circle
          cx={node.x + GATE_WIDTH + BUBBLE_RADIUS}
          cy={node.y + h / 2}
          r={BUBBLE_RADIUS}
          className="bubble"
        />
      )}
      {node.type === 'not' && (
        <circle
          cx={node.x + GATE_WIDTH + BUBBLE_RADIUS}
          cy={node.y + h / 2}
          r={BUBBLE_RADIUS}
          className="bubble"
        />
      )}
      <OutputPort node={node} signal={outputSignal} onPointerDown={onPointerDownOutput} />
    </g>
  );
}

function InputPort({
  node,
  port,
  hovered,
  onEnter,
  onLeave
}: {
  node: CircuitNode;
  port: number;
  hovered: boolean;
  onEnter: (n: CircuitNode, p: number) => void;
  onLeave: () => void;
}) {
  const pos = inputPortPos(node, port);
  return (
    <circle
      cx={pos.x}
      cy={pos.y}
      r={PORT_RADIUS}
      className={`port port-in ${hovered ? 'port-hover' : ''}`}
      onPointerEnter={() => onEnter(node, port)}
      onPointerLeave={onLeave}
    />
  );
}

function OutputPort({
  node,
  signal,
  onPointerDown
}: {
  node: CircuitNode;
  signal: Signal;
  onPointerDown: (e: React.PointerEvent, n: CircuitNode) => void;
}) {
  const pos = outputPortPos(node);
  const fill =
    signal === 'unknown'
      ? SIGNAL_COLORS.unknown
      : signal === 1
        ? SIGNAL_COLORS.one
        : SIGNAL_COLORS.zero;
  return (
    <circle
      cx={pos.x}
      cy={pos.y}
      r={PORT_RADIUS}
      className="port port-out"
      style={{ fill }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e, node);
      }}
    />
  );
}
