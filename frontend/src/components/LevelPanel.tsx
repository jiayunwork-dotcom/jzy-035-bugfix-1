import type { Level, VerifyResult } from '../types';

/** 关卡面板：选择关卡、显示目标真值表、验证结果 */
export function LevelPanel({
  levels,
  activeId,
  onSelect,
  result,
  verifying
}: {
  levels: Level[];
  activeId: string | null;
  onSelect: (id: string) => void;
  result: VerifyResult | null;
  verifying: boolean;
}) {
  const active = levels.find((l) => l.id === activeId) ?? null;

  return (
    <div className="levels">
      <div className="level-tabs">
        {levels.map((l) => (
          <button
            key={l.id}
            className={`level-tab ${l.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(l.id)}
          >
            {l.name.split('：')[0]}
          </button>
        ))}
      </div>

      {active && (
        <div className="level-body">
          <h3>{active.name}</h3>
          <p>{active.description}</p>
          {active.hint && <p className="muted small">提示：{active.hint}</p>}
          <div className="target-table">
            <div className="target-title">
              目标真值表（输入 {active.inputNames.join(', ')} → 输出{' '}
              {active.outputNames.join(', ')}）
            </div>
            <table className="truth-table compact">
              <thead>
                <tr>
                  {active.inputNames.map((n) => (
                    <th key={n}>{n}</th>
                  ))}
                  <th className="sep" />
                  {active.outputNames.map((n) => (
                    <th key={n}>{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.expected.map((out, row) => {
                  const inputs = active.inputNames.map(
                    (_, i) => ((row >> (active.inputCount - 1 - i)) & 1) as 0 | 1
                  );
                  const bad = result?.mismatches.some((m) => m.row === row);
                  return (
                    <tr key={row} className={bad ? 'row-bad' : ''}>
                      {inputs.map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                      <td className="sep">|</td>
                      {out.map((v, i) => (
                        <td key={i} className={`bit-${v}`}>{v}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {verifying && <div className="panel-loading">正在用求值内核逐行验证…</div>}
          {result && (
            <div className={`verify-result ${result.passed ? 'pass' : 'fail'}`}>
              <div className="verify-head">
                {result.passed ? '✅ 过关！' : '❌ 尚未过关'}
              </div>
              <div>{result.message}</div>
              {!result.passed && result.evaluable && result.mismatches.length > 0 && (
                <div className="mismatch-list">
                  {result.mismatches.slice(0, 8).map((m, i) => (
                    <div key={i} className="small">
                      第 {m.row} 行 输入({m.inputs.join('')})：期望{' '}
                      [{m.expected.join(',')}]，实际 [{m.actual.join(',')}]
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
