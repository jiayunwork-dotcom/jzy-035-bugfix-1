import { describe, expect, it } from 'vitest';
import { computeGate, inputPortCount } from '../src/gates.js';

describe('各种逻辑门真值', () => {
  it('与门 AND：全 1 才 1', () => {
    expect(computeGate('and', [0, 0])).toBe(0);
    expect(computeGate('and', [0, 1])).toBe(0);
    expect(computeGate('and', [1, 0])).toBe(0);
    expect(computeGate('and', [1, 1])).toBe(1);
  });

  it('或门 OR：有 1 即 1', () => {
    expect(computeGate('or', [0, 0])).toBe(0);
    expect(computeGate('or', [0, 1])).toBe(1);
    expect(computeGate('or', [1, 0])).toBe(1);
    expect(computeGate('or', [1, 1])).toBe(1);
  });

  it('非门 NOT：取反', () => {
    expect(computeGate('not', [0])).toBe(1);
    expect(computeGate('not', [1])).toBe(0);
  });

  it('与非 NAND / 或非 NOR', () => {
    expect(computeGate('nand', [1, 1])).toBe(0);
    expect(computeGate('nand', [0, 1])).toBe(1);
    expect(computeGate('nor', [0, 0])).toBe(1);
    expect(computeGate('nor', [1, 0])).toBe(0);
  });

  it('异或 XOR / 同或 XNOR 四行齐全', () => {
    const xor = [[0, 0], [0, 1], [1, 0], [1, 1]].map((p) => computeGate('xor', p as [0 | 1, 0 | 1]));
    expect(xor).toEqual([0, 1, 1, 0]);
    const xnor = [[0, 0], [0, 1], [1, 0], [1, 1]].map((p) => computeGate('xnor', p as [0 | 1, 0 | 1]));
    expect(xnor).toEqual([1, 0, 0, 1]);
  });

  it('输入口数量符合定义', () => {
    expect(inputPortCount('input')).toBe(0);
    expect(inputPortCount('output')).toBe(1);
    expect(inputPortCount('not')).toBe(1);
    expect(inputPortCount('and')).toBe(2);
    expect(inputPortCount('xor')).toBe(2);
  });
});
