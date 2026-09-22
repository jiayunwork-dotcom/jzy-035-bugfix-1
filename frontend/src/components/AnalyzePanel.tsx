import type { AnalyzeResult, CircuitNode } from '../types';
import { KarnaughMapView } from './KarnaughMapView';

/** 右侧分析面板：输入挑选、真值表、SOP 表达式、卡诺图（2~4 变量） */
export function AnalyzePanel({
  result,
  loading,
  error,
  onExportCsv,
  inputs,
  picked,
  onTogglePick,
  onPickAll,
  onReAnalyze
}: {
  result: AnalyzeResult | null;
  loading: boolean;
  error: string | null;
  onExportCsv: () => void;
  /** 画布上的全部输入开关（已按位置排序） */
  inputs: CircuitNode[];
  /** 勾选参与穷举的输入 id；null 表示全部 */
  picked: Set<string> | null;
  onTogglePick: (id: string) => void;
  onPickAll: () => void;
  onReAnalyze: () => void;
}) {
  const picker = inputs.length > 0 && (
    <section className="input-picker">
      <h3>参与穷举的输入</h3>
      <div className="picker-list">
        {inputs.map((n) => {
          const name = n.label?.trim() || n.id;
          const checked = picked === null || picked.has(n.id);
          return (
            <label key={n.id} className="picker-item">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onTogglePick(n.id)}
              />
              <span className="picker-name">{name}</span>
              <span className="muted small">当前 {n.value ?? 0}</span>
            </label>
          );
        })}
      </div>
      <div className="picker-actions">
        <button className="btn small" onClick={onPickAll}>
          全选
        </button>
        <button className="btn small primary" onClick={onReAnalyze} disabled={loading}>
          {loading ? '分析中…' : '重新分析'}
        </button>
      </div>
      <div className="muted small">
        未勾选的开关保持当前电平参与运算，不进入真值表；勾选几个就穷举 2 的几次方行。
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="analyze">
        {picker}
        <div className="panel-loading">后端正在穷举真值表…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="analyze">
        {picker}
        <div className="panel-error">⚠ {error}</div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="analyze">
        {picker}
        <div className="panel-empty">
          搭好电路后点击上方「分析电路」，由后端穷举真值表、提取 SOP 表达式并化简卡诺图。
        </div>
      </div>
    );
  }

  const { truthTable: tt, expressions, karnaughMaps } = result;
  // 卡诺图按实际参与穷举的变量数判断（子集模式下可能少于画布输入总数）
  const nVars = tt.inputNames.length;

  return (
    <div className="analyze">
      {picker}
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
                <tr key={ri}>
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
        {nVars < 2 || nVars > 4 ? (
          <div className="panel-empty">
            卡诺图只支持 2~4 个输入变量（当前参与穷举的有 {nVars} 个
            {nVars > 4 ? '：5 变量以上无法在平面上保证每个逻辑相邻项都几何相邻，圈组会产生歧义' : ''}
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
