import { useCallback, useRef, useState } from 'react';

/**
 * 撤销 / 重做历史：以电路快照为单位压栈，上限 100 步
 * （满足“至少留几十步历史”）。
 *
 * 连续编辑（拖动元件）通过 beginTransaction/commitTransaction 包起来：
 * 拖动按下时把编辑前状态存为事务起点，期间任意多次中间更新只产生一个撤销点。
 */
export interface History<T> {
  state: T;
  /** 普通提交：编辑前状态入栈，清空 redo 栈 */
  setState: (next: T | ((prev: T) => T)) => void;
  beginTransaction: () => void;
  commitTransaction: () => void;
  /** 事务期间的合并更新（不入栈） */
  setTransient: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
  depth: number;
}

const LIMIT = 100;

export function useHistory<T>(initial: T): History<T> {
  const [present, setPresent] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const checkpoint = useRef<T | null>(null);
  const [, force] = useState(0);

  const pushPast = useCallback((value: T) => {
    past.current.push(value);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
  }, []);

  const setState = useCallback(
    (next: T | ((prev: T) => T)) => {
      setPresent((prev) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        pushPast(prev);
        return value;
      });
      force((n) => n + 1);
    },
    [pushPast]
  );

  const beginTransaction = useCallback(() => {
    if (checkpoint.current === null) checkpoint.current = present;
  }, [present]);

  const commitTransaction = useCallback(() => {
    if (checkpoint.current !== null) {
      // 纯点击（没有任何移动）不产生撤销点
      if (!Object.is(checkpoint.current, present)) {
        pushPast(checkpoint.current);
      }
      checkpoint.current = null;
      force((n) => n + 1);
    }
  }, [present, pushPast]);

  const setTransient = useCallback((next: T | ((prev: T) => T)) => {
    setPresent((prev) =>
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next
    );
  }, []);

  const undo = useCallback(() => {
    // 事务未提交时，先回退到事务起点
    if (checkpoint.current !== null) {
      const target = checkpoint.current;
      checkpoint.current = null;
      future.current.push(present);
      setPresent(target);
      force((n) => n + 1);
      return;
    }
    const previous = past.current.pop();
    if (previous === undefined) return;
    future.current.push(present);
    setPresent(previous);
    force((n) => n + 1);
  }, [present]);

  const redo = useCallback(() => {
    checkpoint.current = null;
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(present);
    setPresent(next);
    force((n) => n + 1);
  }, [present]);

  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    checkpoint.current = null;
    setPresent(next);
    force((n) => n + 1);
  }, []);

  return {
    state: present,
    setState,
    beginTransaction,
    commitTransaction,
    setTransient,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0 || checkpoint.current !== null,
    canRedo: future.current.length > 0,
    depth: past.current.length
  };
}
