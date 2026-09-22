import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { AnalyzePanel } from './components/AnalyzePanel';
import { LevelPanel } from './components/LevelPanel';
import {
  addNode,
  canConnect,
  connect,
  deleteEdge,
  deleteSelection,
  deserialize,
  emptyCircuit,
  moveNode,
  renameNode,
  serialize,
  toggleSwitch
} from './operations';
import type {
  AnalyzeResult,
  Circuit,
  EvaluateResult,
  GateType,
  Level,
  VerifyResult
} from './types';
import { useHistory } from './useHistory';

type Tab = 'analyze' | 'levels';

export default function App() {
  const history = useHistory<Circuit>(emptyCircuit());
  const { state: circuit } = history;

  const [evaluation, setEvaluation] = useState<EvaluateResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('analyze');
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  /* ------------------------- 实时求值（拨开关/编辑） ------------------------- */
  // 拖动期间指针事件很密，用 120ms 防抖合并；最后一次电路状态一定被求值
  const runEvaluate = useCallback(async (c: Circuit) => {
    try {
      const r = await api.evaluate(c);
      setEvaluation(r);
      setEvalError(r.cyclic ? r.message ?? '电路存在反馈环' : null);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void runEvaluate(circuit), 120);
    return () => window.clearTimeout(t);
  }, [circuit, runEvaluate]);

  useEffect(() => {
    api.levels().then((r) => setLevels(r.levels)).catch(() => undefined);
  }, []);

  /* ------------------------------ 编辑操作 ------------------------------ */

  const commit = useCallback(
    (fn: (c: Circuit) => Circuit) => {
      history.setState((c) => fn(c));
      setVerifyResult(null);
      setAnalysis(null);
    },
    [history]
  );

  const handleAddNode = useCallback(
    (type: GateType, x: number, y: number) => {
      commit((c) => addNode(c, type, x, y));
      showToast(`已放置 ${type}`);
    },
    [commit, showToast]
  );

  const handleToggle = useCallback(
    (id: string) => {
      // 拨开关也算一次可撤销操作
      history.setState((c) => toggleSwitch(c, id));
      setVerifyResult(null);
    },
    [history]
  );

  // 拖动移动：按下时开启事务（Canvas 在 pointerdown body 时回调 begin），
  // 过程中走瞬态更新，松手提交 —— 整次拖动只占一个撤销点。
  const handleMoveBegin = useCallback(() => {
    history.beginTransaction();
  }, [history]);

  const handleMoveNodes = useCallback(
    (dx: number, dy: number, finished: boolean) => {
      if (!finished) {
        history.setTransient((c) => {
          let next = c;
          selectedNodes.forEach((id) => {
            const n = next.nodes.find((x) => x.id === id);
            if (n) next = moveNode(next, id, n.x + dx, n.y + dy);
          });
          return next;
        });
      } else {
        history.commitTransaction();
      }
    },
    [history, selectedNodes]
  );

  const handleConnect = useCallback(
    (sourceId: string, targetId: string, inputPort: number) => {
      if (!canConnect(circuit, sourceId, targetId, inputPort).ok) return;
      commit((c) => connect(c, sourceId, targetId, inputPort));
    },
    [circuit, commit]
  );

  const deleteSelected = useCallback(() => {
    if (selectedNodes.size > 0) {
      commit((c) => deleteSelection(c, selectedNodes));
      setSelectedNodes(new Set());
    } else if (selectedEdge) {
      const id = selectedEdge;
      commit((c) => deleteEdge(c, id));
      setSelectedEdge(null);
    }
  }, [commit, selectedEdge, selectedNodes]);

  const renameSelected = useCallback(() => {
    if (selectedNodes.size !== 1) return;
    const id = [...selectedNodes][0]!;
    const node = circuit.nodes.find((n) => n.id === id);
    if (!node || (node.type !== 'input' && node.type !== 'output')) return;
    const label = window.prompt('给这个端口起个变量名（如 A、B、Y）：', node.label ?? '');
    if (label === null) return;
    commit((c) => renameNode(c, id, label));
  }, [circuit.nodes, commit, selectedNodes]);

  /* ------------------------------ 快捷键 ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        history.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedNodes(new Set());
        setSelectedEdge(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, history]);

  /* ------------------------------ 序列化 ------------------------------ */

  const handleSave = useCallback(() => {
    const blob = new Blob([serialize(circuit)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'logiclab-circuit.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('电路已导出为 JSON 文件');
  }, [circuit, showToast]);

  const handleLoad = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const loaded = deserialize(String(reader.result));
          history.reset(loaded);
          setSelectedNodes(new Set());
          setAnalysis(null);
          setVerifyResult(null);
          showToast('电路已从文件恢复');
        } catch (err) {
          showToast(err instanceof Error ? err.message : '文件解析失败');
        }
      };
      reader.readAsText(file);
    },
    [history, showToast]
  );

  /* ------------------------------ 分析 ------------------------------ */

  const inputCount = useMemo(
    () => circuit.nodes.filter((n) => n.type === 'input').length,
    [circuit.nodes]
  );
  const outputCount = useMemo(
    () => circuit.nodes.filter((n) => n.type === 'output').length,
    [circuit.nodes]
  );

  // 画布上的输入开关（与后端默认顺序一致：先 x 后 y）
  const inputNodes = useMemo(
    () =>
      circuit.nodes
        .filter((n) => n.type === 'input')
        .sort((a, b) => a.x - b.x || a.y - b.y),
    [circuit.nodes]
  );

  // 勾选参与穷举的输入；null 表示全部（默认）。未勾选的开关保持当前电平参与运算。
  const [pickedInputs, setPickedInputs] = useState<Set<string> | null>(null);

  const analyzeInputIds = useMemo(() => {
    if (pickedInputs === null) return undefined;
    return inputNodes.filter((n) => pickedInputs.has(n.id)).map((n) => n.id);
  }, [pickedInputs, inputNodes]);

  const handleTogglePick = useCallback(
    (id: string) => {
      setPickedInputs((prev) => {
        const next = new Set(prev ?? inputNodes.map((n) => n.id));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [inputNodes]
  );

  const handlePickAll = useCallback(() => setPickedInputs(null), []);

  const handleAnalyze = useCallback(async () => {
    if (inputCount === 0 || outputCount === 0) {
      setAnalyzeError('电路至少需要一个输入开关和一个输出指示灯');
      return;
    }
    if (analyzeInputIds && analyzeInputIds.length === 0) {
      setAnalyzeError('请至少勾选一个参与穷举的输入开关（或点「全选」）');
      return;
    }
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const r = await api.analyze(circuit, analyzeInputIds);
      setAnalysis(r);
      setTab('analyze');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }, [circuit, inputCount, outputCount, analyzeInputIds]);

  const handleExportCsv = useCallback(async () => {
    try {
      const r = await api.truthTableCsv(circuit, analyzeInputIds);
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导出失败');
    }
  }, [circuit, analyzeInputIds, showToast]);

  /* ------------------------------ 关卡 ------------------------------ */

  const handleVerify = useCallback(async () => {
    if (!activeLevel) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await api.verify(circuit, activeLevel);
      setVerifyResult(r);
    } catch (err) {
      setVerifyResult({
        levelId: activeLevel,
        passed: false,
        evaluable: false,
        mismatches: [],
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setVerifying(false);
    }
  }, [activeLevel, circuit]);

  /* ------------------------------ 渲染 ------------------------------ */

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▣</span> LogicLab 组合逻辑实验台
        </div>
        <div className="topbar-actions">
          <button
            className="btn"
            onClick={history.undo}
            disabled={!history.canUndo}
            title="Ctrl+Z"
          >
            ↶ 撤销
          </button>
          <button
            className="btn"
            onClick={history.redo}
            disabled={!history.canRedo}
            title="Ctrl+Y / Ctrl+Shift+Z"
          >
            ↷ 重做
          </button>
          <span className="history-depth">历史 {history.depth} 步</span>
          <span className="divider" />
          <button className="btn" onClick={renameSelected} title="给选中的输入/输出改名">
            改名
          </button>
          <button className="btn" onClick={handleSave}>
            保存
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            读取
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoad(f);
              e.target.value = '';
            }}
          />
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('清空画布？当前电路（不含历史）将被移除。')) {
                history.reset(emptyCircuit());
                setAnalysis(null);
                setVerifyResult(null);
              }
            }}
          >
            清空
          </button>
          <span className="divider" />
          <button className="btn primary" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? '分析中…' : '🔍 分析电路'}
          </button>
          {tab === 'levels' && activeLevel && (
            <button className="btn success" onClick={handleVerify} disabled={verifying}>
              {verifying ? '验证中…' : '✓ 验证本关'}
            </button>
          )}
        </div>
      </header>

      <div className="main">
        <Toolbar />

        <main className="canvas-wrap">
          {evalError && (
            <div className={`cycle-banner ${evaluation?.cyclic ? 'cyclic' : 'warn'}`}>
              {evaluation?.cyclic ? '⛔ ' : '⚠ '}
              {evalError}
              {evaluation?.cyclic &&
                ' —— 环上的元件已红框标出，所有导线显示为灰色虚线，不会给出任何猜测结果。'}
            </div>
          )}
          <Canvas
            circuit={circuit}
            evaluation={evaluation}
            selectedNodeIds={selectedNodes}
            selectedEdgeId={selectedEdge}
            onSelectNodes={(ids) => setSelectedNodes(ids)}
            onSelectEdge={setSelectedEdge}
            onMoveBegin={handleMoveBegin}
            onMoveNodes={handleMoveNodes}
            onToggleSwitch={handleToggle}
            onAddNodeAt={handleAddNode}
            onConnect={handleConnect}
            onCanvasBackground={() => {
              setSelectedNodes(new Set());
              setSelectedEdge(null);
            }}
          />
          <div className="canvas-hint">
            滚轮缩放 · 拖空白平移 · 从输出口（右）拉线到输入口（左）·
            点击开关拨 0/1 · 选中后 Delete 删除 · Shift 多选
          </div>
        </main>

        <aside className="sidebar">
          <div className="tabs">
            <button
              className={`tab ${tab === 'analyze' ? 'active' : ''}`}
              onClick={() => setTab('analyze')}
            >
              分析结果
            </button>
            <button
              className={`tab ${tab === 'levels' ? 'active' : ''}`}
              onClick={() => setTab('levels')}
            >
              教学关卡
            </button>
          </div>
          <div className="tab-body">
            {tab === 'analyze' ? (
              <AnalyzePanel
                result={analysis}
                loading={analyzing}
                error={analyzeError}
                onExportCsv={handleExportCsv}
                inputs={inputNodes}
                picked={pickedInputs}
                onTogglePick={handleTogglePick}
                onPickAll={handlePickAll}
                onReAnalyze={handleAnalyze}
              />
            ) : (
              <>
                <LevelPanel
                  levels={levels}
                  activeId={activeLevel}
                  onSelect={setActiveLevel}
                  result={verifyResult}
                  verifying={verifying}
                />
                {activeLevel && (
                  <button className="btn success block" onClick={handleVerify} disabled={verifying}>
                    {verifying ? '验证中…' : '✓ 搭好了，验证本关'}
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
