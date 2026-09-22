import type { AnalyzeResult, CircuitNode } from '../types';
import { KarnaughMapView } from './KarnaughMapView';

/** 右侧分析面板：真值表、SOP 表达式、卡诺图（2~4 变量） */
export function AnalyzePanel({
  result,
  loading,
  error,
  onExportCsv,
  inputNodes,
  selectedInputIds,
  onToggleInput,
  onSelectAllInputs
}: {
  result: AnalyzeResult | null;
  loading: boolean;
  error: string | null;
  onExportCsv: () => void;
  inputNodes: CircuitNode[];
  selectedInputIds: Set<string>;
  onToggleInput: (id: string, checked: boolean) => void;
  onSelectAllInputs: () => void;
}) {
  const nEnumerated = selectedInputIds.size;
  const tt = result?.truthTable;

  const inputPicker =
    inputNodes.length > 0 ? (
      <section className="input-picker">
        <h3>参与穷举的输入</h3>
        <div className="muted small">
          勾选的开关逐行穷举并对应真值表的列；未勾选的开关保持当前电平参与运算。
        </div>
        <div className="input-picker-row">
          {inputNodes.map((n) => (
            <label key={n.id} className="input-chip">
              <input
                type="checkbox"
                checked={selectedInputIds.has(n.id)}
                onChange={(e) => onToggleInput(n.id, e.target.checked)}
              />
              <span className="input-chip-name">{n.label?.trim() || n.id}</span>
              <span className="input-chip-value muted">= {n.value ?? 0}</span>
            </label>
          ))}
          {inputNodes.some((n) => !selectedInputIds.has(n.id)) && (
            <button type="button" className="btn small" onClick={onSelectAllInputs}>
              全选
            </button>
          )}
        </div>
        {nEnumerated === 0 ? (
          <div className="panel-warning">⚠ 请至少勾选一个输入开关再分析。</div>
        ) : (
          nEnumerated < inputNodes.length && (
            <div className="muted small">
              将穷举 {2 ** nEnumerated} 行；其余 {inputNodes.length - nEnumerated}{' '}
              个开关按其当前电平固定。
            </div>
          )
        )}
      </section>
    ) : null;

  if (loading) {
    return (
      <div className="analyze">
        {inputPicker}
        <div className="panel-loading">后端正在穷举真值表…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="analyze">
        {inputPicker}
        <div className="panel-error">⚠ {error}</div>
      </div>
    );
  }
  if (!result || !tt) {
    return (
      <div className="analyze">
        {inputPicker}
        <div className="panel-empty">
          搭好电路后点击上方「分析电路」，由后端穷举真值表、提取 SOP 表达式并化简卡诺图。
        </div>
      </div>
    );
  }

  const { expressions, karnaughMaps } = result;
  const mismatchSet = new Set<number>();

  // 卡诺图是否支持取决于本次穷举的变量数（子集穷举时可能少于画布输入总数）
  const enumeratedCount = tt.inputNames.length;

  return (
    <div className="analyze">
      {inputPicker}

      <section>
        <h3>真值表（{tt.rowCount.toLocaleString()} 行）</h3>
        {tt.warning && <div className="panel-warning">⚠ {tt.warning}</div>}
        <div className="table-scroll">
          <table className="truth-table">
            <thead>
              <tr>
                {tt.inputNames.map((n) => (
                  <th key={`i${n}`}>{n}</th>
                ))}
                <th className="sep" />
                {tt.outputNames.map((n) => (
                  <th key={`o${n}`} className="out-col">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tt.rows.map((row, ri) => (
                <tr key={ri} className={mismatchSet.has(ri) ? 'row-bad' : ''}>
                  {row.inputs.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                  <td className="sep">|</td>
                  {row.outputs.map((v, i) => (
                    <td key={i} className={`out-col bit-${v}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn small" onClick={onExportCsv}>
          导出 CSV
        </button>
      </section>

      <section>
        <h3>布尔表达式（SOP 积之和）</h3>
        {expressions.map((ex) => (
          <div key={ex.outputId} className="expr-row">
            <span className="expr-name">{ex.outputName} =</span>
            <span className="expr-text">{ex.canonical}</span>
            {ex.constant === undefined && (
              <span className="muted">Σm({ex.minterms.join(', ')})</span>
            )}
          </div>
        ))}
        <div className="muted small">
          记号：A·B 为与，+ 为或，A′ 为非。以上为规范 SOP（每个 1 对应一个最小项），
          最简形式见下方卡诺图。
        </div>
      </section>

      <section>
        <h3>卡诺图化简</h3>
        {enumeratedCount < 2 || enumeratedCount > 4 ? (
          <div className="panel-empty">
            卡诺图只支持 2~4 个输入变量（本次穷举 {enumeratedCount} 个
            {enumeratedCount > 4 ? '：5 变量以上无法在平面上保证每个逻辑相邻项都几何相邻，圈组会产生歧义' : ''}
            ），因此不提供卡诺图。真值表与 SOP 仍然有效。
          </div>
        ) : (
          karnaughMaps.map((km) => (
            <KarnaughMapView
              key={km.outputId}
              km={km}
              colVarNames={tt.inputNames.slice(0, 2)}
              rowVarNames={tt.inputNames.slice(2)}
            />
          ))
        )}
      </section>
    </div>
  );
}
