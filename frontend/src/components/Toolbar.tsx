import React from 'react';
import type { GateType } from '../types';

interface ToolbarItem {
  type: GateType;
  name: string;
  symbol: string;
}

const ITEMS: ToolbarItem[] = [
  { type: 'input', name: '输入开关', symbol: 'A' },
  { type: 'output', name: '输出指示灯', symbol: 'Y' },
  { type: 'and', name: '与门', symbol: '&' },
  { type: 'or', name: '或门', symbol: '≥1' },
  { type: 'not', name: '非门', symbol: '1○' },
  { type: 'nand', name: '与非门', symbol: '&○' },
  { type: 'nor', name: '或非门', symbol: '≥1○' },
  { type: 'xor', name: '异或门', symbol: '=1' },
  { type: 'xnor', name: '同或门', symbol: '=1○' }
];

/** 左侧工具栏：HTML5 拖放，拖到画布上落下即摆放 */
export function Toolbar() {
  return (
    <aside className="toolbar">
      <div className="toolbar-title">元件库</div>
      <div className="toolbar-hint">拖到画布上摆放</div>
      <div className="toolbar-list">
        {ITEMS.map((item) => (
          <div
            key={item.type}
            className="toolbar-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-gate-type', item.type);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={item.name}
          >
            <span className="toolbar-symbol">{item.symbol}</span>
            <span className="toolbar-name">{item.name}</span>
          </div>
        ))}
      </div>
      <div className="toolbar-legend">
        <div className="legend-title">导线颜色</div>
        <div><span className="swatch swatch-one" /> 高电平 1</div>
        <div><span className="swatch swatch-zero" /> 低电平 0</div>
        <div><span className="swatch swatch-unknown" /> 未算出（环）</div>
      </div>
    </aside>
  );
}

// 避免 React 未直接使用的告警（JSX 自动运行时之外的保险）
void React;
