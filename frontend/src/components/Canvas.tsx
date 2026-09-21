import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GATE_WIDTH,
  gateHeight,
  hitInputPort,
  screenToWorld,
  type Point,
  type ViewTransform
} from '../geometry';
import { canConnect } from '../operations';
import type {
  Circuit,
  CircuitNode,
  EvaluateResult,
  GateType
} from '../types';
import { GateView } from './GateView';
import { PendingWire, WireView } from './WireView';

interface CanvasProps {
  circuit: Circuit;
  evaluation: EvaluateResult | null;
  selectedNodeIds: Set<string>;
  selectedEdgeId: string | null;
  onSelectNodes: (ids: Set<string>, additive: boolean) => void;
  onSelectEdge: (id: string | null) => void;
  onMoveBegin: () => void;
  onMoveNodes: (dx: number, dy: number, finished: boolean) => void;
  onToggleSwitch: (id: string) => void;
  onAddNodeAt: (type: GateType, x: number, y: number) => void;
  onConnect: (sourceId: string, targetId: string, inputPort: number) => void;
  onCanvasBackground: () => void;
}

interface PendingWire {
  sourceId: string;
  pointer: Point;
  hoverTarget: { node: CircuitNode; port: number } | null;
}

type DragMode =
  | { kind: 'pan'; startX: number; startY: number; origTx: number; origTy: number }
  | { kind: 'move'; startWorld: Point; moved: boolean }
  | null;

export function Canvas({
  circuit,
  evaluation,
  selectedNodeIds,
  selectedEdgeId,
  onSelectNodes,
  onSelectEdge,
  onMoveBegin,
  onMoveNodes,
  onToggleSwitch,
  onAddNodeAt,
  onConnect,
  onCanvasBackground
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewTransform>({ scale: 1, tx: 40, ty: 40 });
  const [drag, setDrag] = useState<DragMode>(null);
  const [pending, setPending] = useState<PendingWire | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, CircuitNode>();
    circuit.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [circuit.nodes]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current!.getBoundingClientRect();
      return screenToWorld(
        { x: clientX - rect.left, y: clientY - rect.top },
        view
      );
    },
    [view]
  );

  /* ------------------------------ 缩放/平移 ------------------------------ */

  const onWheel = (e: React.WheelEvent) => {
    // 非被动监听由 React 的 onWheel 提供；以鼠标位置为锚点缩放
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const scale = Math.min(2.5, Math.max(0.3, view.scale * factor));
    const wx = (mx - view.tx) / view.scale;
    const wy = (my - view.ty) / view.scale;
    setView({ scale, tx: mx - wx * scale, ty: my - wy * scale });
  };

  const startPan = (e: React.PointerEvent) => {
    setDrag({
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origTx: view.tx,
      origTy: view.ty
    });
  };

  /* ------------------------------ 元件拖动 ------------------------------ */

  const onPointerDownBody = (e: React.PointerEvent, node: CircuitNode) => {
    e.stopPropagation();
    const additive = e.shiftKey;
    if (!selectedNodeIds.has(node.id)) {
      onSelectNodes(new Set(additive ? [...selectedNodeIds, node.id] : [node.id]), additive);
    } else if (additive) {
      const next = new Set(selectedNodeIds);
      next.delete(node.id);
      onSelectNodes(next, true);
    }
    onSelectEdge(null);
    onMoveBegin();
    setDrag({ kind: 'move', startWorld: toWorld(e.clientX, e.clientY), moved: false });
  };

  /* ------------------------------ 拉线 ------------------------------ */

  const beginWire = (e: React.PointerEvent, node: CircuitNode) => {
    e.stopPropagation();
    setPending({ sourceId: node.id, pointer: toWorld(e.clientX, e.clientY), hoverTarget: null });
  };

  const onPointerEnterPort = (node: CircuitNode, port: number) => {
    setPending((p) => (p ? { ...p, hoverTarget: { node, port } } : p));
  };
  const onPointerLeavePort = () => {
    setPending((p) => (p ? { ...p, hoverTarget: null } : p));
  };

  /* ------------------------------ 全局指针 ------------------------------ */

  // 挂在 window 上：即使拖到画布外（甚至越过浏览器边缘）松手也能正常收尾
  useEffect(() => {
    if (!drag && !pending) return;
    const onMove = (ev: PointerEvent) => {
      const world = toWorld(ev.clientX, ev.clientY);
      if (drag?.kind === 'pan') {
        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        setView((v) => ({ ...v, tx: drag.origTx + dx, ty: drag.origTy + dy }));
      } else if (drag?.kind === 'move') {
        const dx = world.x - drag.startWorld.x;
        const dy = world.y - drag.startWorld.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        onMoveNodes(dx, dy, false);
        // 以当前鼠标位置为新基准，每帧增量移动
        drag.startWorld = world;
      }
      if (pending) {
        let hover = pending.hoverTarget;
        if (!hover) {
          for (const n of circuit.nodes) {
            const p = hitInputPort(n, world);
            if (p !== null) {
              hover = { node: n, port: p };
              break;
            }
          }
        }
        setPending({ ...pending, pointer: world, hoverTarget: hover });
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (drag?.kind === 'move') {
        onMoveNodes(0, 0, true);
      }
      if (pending) {
        const world = toWorld(ev.clientX, ev.clientY);
        let target = pending.hoverTarget;
        if (!target) {
          for (const n of circuit.nodes) {
            const p = hitInputPort(n, world);
            if (p !== null) {
              target = { node: n, port: p };
              break;
            }
          }
        }
        if (target) {
          const check = canConnect(
            circuit,
            pending.sourceId,
            target.node.id,
            target.port
          );
          if (check.ok) onConnect(pending.sourceId, target.node.id, target.port);
        }
        // 落歪 / 非法：直接取消
        setPending(null);
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, pending, circuit, toWorld, onMoveNodes, onConnect]);

  /* ------------------------------ 拖放（工具栏） ------------------------------ */

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/x-gate-type') as GateType;
    if (!type) return;
    const w = toWorld(e.clientX, e.clientY);
    onAddNodeAt(type, w.x - GATE_WIDTH / 2, w.y - gateHeight(type) / 2);
  };

  const pendingValid = pending?.hoverTarget
    ? canConnect(circuit, pending.sourceId, pending.hoverTarget.node.id, pending.hoverTarget.port).ok
    : false;

  const cycleSet = new Set(evaluation?.cycleNodeIds ?? []);

  return (
    <svg
      ref={svgRef}
      className="canvas"
      onWheel={onWheel}
      onPointerDown={(e) => {
        const el = e.target as Element;
        // 点的是空白背景 / 网格：开始平移并清选择（点线/门/端口不触发）
        if (el === e.currentTarget || el.classList.contains('grid-bg')) {
          onCanvasBackground();
          startPan(e);
        }
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" className="grid-line" />
        </pattern>
      </defs>
      <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
        {/* 网格背景（世界空间，足够大） */}
        <rect
          x={-2000}
          y={-2000}
          width={8000}
          height={8000}
          fill="url(#grid)"
          className="grid-bg"
        />

        {/* 先画线，再画门，端口圆点压在最上层 */}
        {circuit.edges.map((edge) => {
          const src = nodeById.get(edge.source);
          const dst = nodeById.get(edge.target);
          if (!src || !dst) return null;
          return (
            <WireView
              key={edge.id}
              edge={edge}
              source={src}
              target={dst}
              signal={evaluation?.edgeValues[edge.id] ?? 'unknown'}
              selected={selectedEdgeId === edge.id}
              onSelect={(e, id) => {
                e.stopPropagation();
                onSelectEdge(id);
                onSelectNodes(new Set(), false);
              }}
            />
          );
        })}

        {pending && (
          <PendingWire
            circuit={circuit}
            sourceId={pending.sourceId}
            pointer={pending.pointer}
            valid={pendingValid}
          />
        )}

        {circuit.nodes.map((node) => (
          <GateView
            key={node.id}
            node={node}
            selected={selectedNodeIds.has(node.id)}
            highlightedCycle={cycleSet.has(node.id)}
            outputSignal={evaluation?.nodeValues[node.id] ?? 'unknown'}
            hoverPort={
              pending?.hoverTarget?.node.id === node.id ? pending.hoverTarget.port : null
            }
            onPointerDownBody={onPointerDownBody}
            onPointerDownOutput={beginWire}
            onPointerEnterPort={onPointerEnterPort}
            onPointerLeavePort={onPointerLeavePort}
            onClickSwitch={(n) => onToggleSwitch(n.id)}
          />
        ))}
      </g>
    </svg>
  );
}
