import type { AnalyzeResult } from '../types';
import { KarnaughMapView } from './KarnaughMapView';

/** 右侧分析面板：真值表、SOP 表达式、卡诺图（2~4 变量） */
export function AnalyzePanel({
  result,
  loading,
  error,
  onExportCsv,
  nInputs
}: {
  result: AnalyzeResult | null;
  loading: boolean;
  error: string | null;
  onExportCsv: () => void;
  nInputs: number;
}) {
  if (loading) return <div className="panel-loading">后端正在穷举真值表…</div>;
  if (error) return <div className="panel-error">⚠ {error}</div>;
  if (!result) {
    return (
      <div className="panel-empty">
        搭好电路后点击上方「分析电路」，由后端穷举真值表、提取 SOP 表达式并化简卡诺图。
      </div>
    );
  }

  const { truthTable: tt, expressions, karnaughMaps } = result;
  const mismatchSet = new Set<number>();

  return (
    <div className="analyze">
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
        {nInputs < 2 || nInputs > 4 ? (
          <div className="panel-empty">
            卡诺图只支持 2~4 个输入变量（当前 {nInputs} 个
            {nInputs > 4 ? '：5 变量以上无法在平面上保证每个逻辑相邻项都几何相邻，圈组会产生歧义' : ''}
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
