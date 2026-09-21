/** 前端电路模型（与后端 src/types.ts 保持一致的 JSON 结构） */

export type GateType =
  | 'input'
  | 'output'
  | 'and'
  | 'or'
  | 'not'
  | 'nand'
  | 'nor'
  | 'xor'
  | 'xnor';

export interface CircuitNode {
  id: string;
  type: GateType;
  x: number;
  y: number;
  label?: string;
  value?: 0 | 1;
}

export interface CircuitEdge {
  id: string;
  source: string;
  target: string;
  outputPort?: number;
  inputPort: number;
}

export interface Circuit {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
}

export type Bit = 0 | 1;
export type Signal = Bit | 'unknown';

export interface EvaluateResult {
  nodeValues: Record<string, Signal>;
  edgeValues: Record<string, Signal>;
  outputLights: Record<string, Bit>;
  cyclic: boolean;
  cycleNodeIds?: string[];
  message?: string;
}

export interface TruthTableRow {
  inputs: Bit[];
  outputs: Bit[];
}

export interface TruthTable {
  inputIds: string[];
  inputNames: string[];
  outputIds: string[];
  outputNames: string[];
  rows: TruthTableRow[];
  rowCount: number;
  warning?: string;
}

export interface Literal {
  kind: 'const' | 'var';
  value?: 0 | 1;
  name?: string;
  negated?: boolean;
}

export interface SopTerm {
  literals: Literal[];
  minterm?: number;
}

export interface ExpressionResult {
  outputId: string;
  outputName: string;
  canonical: string;
  terms: SopTerm[];
  minterms: number[];
  constant?: 0 | 1;
}

export interface KarnaughGroup {
  literals: Literal[];
  term: string;
  minterms: number[];
  essential: boolean;
  pieces: { row: number; col: number; w: number; h: number }[];
}

export interface KarnaughMapResult {
  outputId: string;
  outputName: string;
  nVars: number;
  rowsVarCount: number;
  colsVarCount: number;
  rowLabels: string[];
  colLabels: string[];
  cellMinterms: number[][];
  cellValues: number[][];
  groups: KarnaughGroup[];
  simplified: string;
  constant?: 0 | 1;
  noOnes?: boolean;
}

export interface AnalyzeResult {
  truthTable: TruthTable;
  expressions: ExpressionResult[];
  karnaughMaps: KarnaughMapResult[];
}

export interface Level {
  id: string;
  name: string;
  description: string;
  inputCount: number;
  outputCount: number;
  inputNames: string[];
  outputNames: string[];
  expected: Bit[][];
  hint?: string;
}

export interface VerifyResult {
  levelId: string;
  passed: boolean;
  evaluable: boolean;
  mismatches: {
    row: number;
    inputs: Bit[];
    expected: Bit[];
    actual: Bit[];
  }[];
  message: string;
}

/** 工具栏可以拖出来的东西 */
export type PaletteItemType = GateType;
