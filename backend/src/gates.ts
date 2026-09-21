import type { Bit, GateType } from './types.js';

/**
 * 各种逻辑门的输入口数量（-1 表示该元件不是门、或不按输入口算）。
 * 非门只有一个输入；二输入门两个输入；输入开关零输入；输出指示灯一输入。
 */
export function inputPortCount(type: GateType): number {
  switch (type) {
    case 'input':
      return 0;
    case 'output':
    case 'not':
      return 1;
    case 'and':
    case 'or':
    case 'nand':
    case 'nor':
    case 'xor':
    case 'xnor':
      return 2;
  }
}

export function outputPortCount(type: GateType): number {
  return type === 'input' ? 1 : 1;
}

/** 门的中文名（工具栏 / 提示用） */
export const GATE_NAMES: Record<GateType, string> = {
  input: '输入开关',
  output: '输出指示灯',
  and: '与门 AND',
  or: '或门 OR',
  not: '非门 NOT',
  nand: '与非门 NAND',
  nor: '或非门 NOR',
  xor: '异或门 XOR',
  xnor: '同或门 XNOR'
};

/** 门内部印的 IEC 矩形符号文字 */
export const GATE_SYMBOLS: Partial<Record<GateType, string>> = {
  and: '&',
  or: '≥1',
  not: '1',
  nand: '&',
  nor: '≥1',
  xor: '=1',
  xnor: '=1'
};

/** 该门的输出端是否带取反小圆圈 */
export function isNegatedOutput(type: GateType): boolean {
  return type === 'nand' || type === 'nor' || type === 'xnor';
}

/** 单输入门（非门） */
export function isSingleInputGate(type: GateType): boolean {
  return type === 'not';
}

/**
 * 计算一个门的输出值。
 * @param type 门类型
 * @param inputs 各输入口的信号（调用方保证悬空输入已补默认值）
 */
export function computeGate(type: GateType, inputs: Bit[]): Bit {
  switch (type) {
    case 'and':
      return inputs.every((v) => v === 1) ? 1 : 0;
    case 'or':
      return inputs.some((v) => v === 1) ? 1 : 0;
    case 'not':
      return inputs[0] === 1 ? 0 : 1;
    case 'nand':
      return inputs.every((v) => v === 1) ? 0 : 1;
    case 'nor':
      return inputs.some((v) => v === 1) ? 0 : 1;
    case 'xor':
      return inputs.reduce((acc, v) => (acc ^ v) as Bit, 0 as Bit);
    case 'xnor':
      return inputs.reduce((acc, v) => (acc ^ v) as Bit, 0 as Bit) === 1 ? 0 : 1;
    case 'input':
    case 'output':
      // 输入开关与指示灯不做门运算
      return 0;
  }
}
