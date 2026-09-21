/**
 * 电路数据模型 —— 前后端通过 HTTP/JSON 交换的核心结构。
 *
 * 约定：
 * - 每个元件（node）有唯一 id、类型、画布坐标 x/y、标签与当前开关值（仅 input 有效）。
 * - 每条连线（edge）从源元件的输出口（outputPort 固定为 0，当前每种元件只有一个输出）
 *   连到目标元件的第 inputPort 个输入口。
 * - 输入口索引从 0 开始，自上而下排列。
 */

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
  /** 输入开关当前值，仅 type === 'input' 时有意义 */
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

/** 求值 / 化简结果中每根线、每个元件输出的信号值 */
export type Bit = 0 | 1;
export type Signal = Bit | 'unknown';

export interface EvaluateResult {
  /** 元件 id -> 该元件输出口的信号值 */
  nodeValues: Record<string, Signal>;
  /** 连线 id -> 这条线上传的信号值 */
  edgeValues: Record<string, Signal>;
  /** 输出灯元件 id -> 灯的亮灭 */
  outputLights: Record<string, Bit>;
  /** 求值是否为合法的组合电路 */
  cyclic: boolean;
  /** 发现反馈环时给出环上的元件 id（按环顺序），用于前端高亮 */
  cycleNodeIds?: string[];
  message?: string;
}

export interface AnalyzeResult {
  truthTable: TruthTable;
  expressions: ExpressionResult[];
  karnaughMaps: KarnaughMapResult[];
}

export interface TruthTable {
  inputIds: string[];
  inputNames: string[];
  outputIds: string[];
  outputNames: string[];
  /** 每一行：inputs 为该组合下各输入的 0/1，outputs 为各输出的 0/1 */
  rows: TruthTableRow[];
  /** 行数（= 2^n） */
  rowCount: number;
  /** 行数过大时给出警告，但仍然生成 */
  warning?: string;
}

export interface TruthTableRow {
  inputs: Bit[];
  outputs: Bit[];
}

export type Literal =
  | { kind: 'const'; value: 0 | 1 }
  | { kind: 'var'; name: string; negated: boolean };

export interface SopTerm {
  literals: Literal[];
  /** 该最小项在真值表中的索引（Canonical SOP 时存在） */
  minterm?: number;
}

export interface ExpressionResult {
  outputId: string;
  outputName: string;
  /** 规范 SOP（最小项之和），例如 A·B' + A·C */
  canonical: string;
  /** 结构化形式，便于前端自行排版 */
  terms: SopTerm[];
  /** 最小项编号列表，例如 Σm(1,3,7) */
  minterms: number[];
  /** 恒 0 / 恒 1 的退化情况 */
  constant?: 0 | 1;
}

/** 卡诺图结果：2~4 个输入变量时给出 */
export interface KarnaughMapResult {
  outputId: string;
  outputName: string;
  nVars: number;
  rowsVarCount: number;
  colsVarCount: number;
  rowLabels: string[];
  colLabels: string[];
  /** 每个格子的最小项编号（-1 表示不存在），尺寸 rowsVarCount/colsVarCount 决定 */
  cellMinterms: number[][];
  /** 每个格子里的输出值 */
  cellValues: number[][];
  /** 圈出的质蕴含项（环面展开后可能拆成若干矩形片） */
  groups: KarnaughGroup[];
  /** 最简 SOP 表达式文本 */
  simplified: string;
  /** 恒 0 / 恒 1 */
  constant?: 0 | 1;
  /** 输出全 0 时没有可圈的 1 */
  noOnes?: boolean;
}

export interface KarnaughGroup {
  /** 该质蕴含项对应的文字（变量被消去则不出现） */
  literals: Literal[];
  term: string;
  minterms: number[];
  essential: boolean;
  /** 画在卡诺图上的矩形片（跨边界的圈会拆成多片），坐标为行列索引 */
  pieces: { row: number; col: number; w: number; h: number }[];
}

/** 教学关卡定义 */
export interface Level {
  id: string;
  name: string;
  description: string;
  inputCount: number;
  outputCount: number;
  inputNames: string[];
  outputNames: string[];
  /** 目标真值表：按输入组合二进制递增排列，每个输出一列 */
  expected: Bit[][];
  hint?: string;
}

export interface VerifyResult {
  levelId: string;
  passed: boolean;
  /** 不匹配的行（仅在实际真值表与目标同尺寸时有意义） */
  mismatches: {
    row: number;
    inputs: Bit[];
    expected: Bit[];
    actual: Bit[];
  }[];
  message: string;
  /** 电路存在反馈环 / 输入输出数量不符等无法比较的情况 */
  evaluable: boolean;
}
