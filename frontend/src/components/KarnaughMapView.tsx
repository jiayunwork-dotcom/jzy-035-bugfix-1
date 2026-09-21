import { useMemo, useState } from 'react';
import type { KarnaughGroup, KarnaughMapResult } from '../types';

const CELL = 46;
const PAD_X = 78;
const PAD_Y = 54;

/**
 * 卡诺图 SVG：格雷码格子 + 质蕴含项矩形圈 + 行列变量标签。
 * 圈的最简选择与后端同一思想：本质项必选，其余贪心地选新增覆盖最多的项。
 */
export function KarnaughMapView({
  km,
  colVarNames,
  rowVarNames
}: {
  km: KarnaughMapResult;
  colVarNames: string[];
  rowVarNames: string[];
}) {
  const rows = km.cellValues.length;
  const cols = km.cellValues[0]?.length ?? 0;
  const width = PAD_X + cols * CELL + 24;
  const height = PAD_Y + rows * CELL + 24;
  const [showAllPrimes, setShowAllPrimes] = useState(false);

  const selectedGroups = useMemo(() => minimalGroups(km), [km]);
  const groupsToDraw = showAllPrimes ? km.groups : selectedGroups;

  return (
    <div className="kmap">
      <div className="kmap-head">
        <span>
          输出 <b>{km.outputName}</b> 的卡诺图（{km.nVars} 变量）
        </span>
        <label className="kmap-toggle">
          <input
            type="checkbox"
            checked={showAllPrimes}
            onChange={(e) => setShowAllPrimes(e.target.checked)}
          />
          显示全部质蕴含项
        </label>
      </div>
      <svg width={width} height={height}>
        {/* 变量名标注 */}
        <text x={PAD_X + (cols * CELL) / 2} y={20} className="kmap-axis" textAnchor="middle">
          {colVarNames.join(' ')}
        </text>
        {rowVarNames.length > 0 && (
          <text x={16} y={PAD_Y - 16} className="kmap-axis">
            {rowVarNames.join(' ')}
          </text>
        )}

        {/* 列格雷码标签 */}
        {km.colLabels.map((label, c) => (
          <text
            key={`c${c}`}
            x={PAD_X + c * CELL + CELL / 2}
            y={PAD_Y - 16}
            className="kmap-axis"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
        {/* 行格雷码标签 */}
        {km.rowLabels.map((label, r) =>
          label === '' ? null : (
            <text
              key={`r${r}`}
              x={PAD_X - 14}
              y={PAD_Y + r * CELL + CELL / 2 + 5}
              className="kmap-axis"
              textAnchor="end"
            >
              {label}
            </text>
          )
        )}

        {/* 圈（跨边界的质蕴含项已在后端拆成若干矩形片） */}
        {groupsToDraw.map((g, gi) => (
          <g key={gi} className={g.essential ? 'group-essential' : 'group-prime'}>
            {g.pieces.map((p, pi) => (
              <rect
                key={pi}
                x={PAD_X + p.col * CELL + 4}
                y={PAD_Y + p.row * CELL + 4}
                width={p.w * CELL - 8}
                height={p.h * CELL - 8}
                rx={10}
                className="kmap-group"
                style={{ stroke: groupColor(gi) }}
              />
            ))}
          </g>
        ))}

        {/* 格子：最小项编号 + 输出值 */}
        {km.cellValues.map((row, r) =>
          row.map((v, c) => (
            <g key={`${r}-${c}`}>
              <rect
                x={PAD_X + c * CELL}
                y={PAD_Y + r * CELL}
                width={CELL}
                height={CELL}
                className="kmap-cell"
              />
              <text
                x={PAD_X + c * CELL + 5}
                y={PAD_Y + r * CELL + 12}
                className="kmap-minterm"
              >
                {km.cellMinterms[r]?.[c]}
              </text>
              <text
                x={PAD_X + c * CELL + CELL / 2}
                y={PAD_Y + r * CELL + CELL / 2 + 7}
                className={`kmap-value ${v === 1 ? 'kmap-one' : ''}`}
                textAnchor="middle"
              >
                {v}
              </text>
            </g>
          ))
        )}
      </svg>
      <div className="kmap-result">
        最简 SOP：<b>{km.simplified}</b>
        {km.constant !== undefined && <span className="muted">（恒 {km.constant}）</span>}
        {km.noOnes && <span className="muted">（没有值为 1 的格子，无需圈）</span>}
      </div>
      <div className="kmap-terms">
        质蕴含项：
        {km.groups.map((g) => (
          <span key={g.term} className={`chip ${g.essential ? 'chip-essential' : ''}`}>
            {g.term}
            {g.essential ? ' ★本质' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function groupColor(i: number): string {
  const palette = ['#e5484d', '#7c5cff', '#12a594', '#f5a524', '#3e7bfa', '#e5649b'];
  return palette[i % palette.length]!;
}

/**
 * 选最简圈组：本质质蕴含项必选；剩余最小项贪心选新增覆盖最多的质蕴含项。
 * 卡诺图至多 16 格，课堂函数下与后端枚举结果一致。
 */
function minimalGroups(km: KarnaughMapResult): KarnaughGroup[] {
  const essential = km.groups.filter((g) => g.essential);
  const covered = new Set<number>();
  essential.forEach((g) => g.minterms.forEach((m) => covered.add(m)));

  const allOnes = km.cellValues.flatMap((row, r) =>
    row
      .map((v, c) => (v === 1 ? km.cellMinterms[r]![c]! : -1))
      .filter((m) => m >= 0)
  );
  const chosen = [...essential];
  let remaining = allOnes.filter((m) => !covered.has(m));

  while (remaining.length > 0) {
    let best: KarnaughGroup | null = null;
    let bestGain = 0;
    for (const g of km.groups) {
      if (chosen.includes(g)) continue;
      const gain = g.minterms.filter((m) => !covered.has(m)).length;
      if (gain > bestGain) {
        bestGain = gain;
        best = g;
      }
    }
    if (!best) break; // 理论上不会发生
    chosen.push(best);
    best.minterms.forEach((m) => covered.add(m));
    remaining = allOnes.filter((m) => !covered.has(m));
  }
  return chosen;
}
