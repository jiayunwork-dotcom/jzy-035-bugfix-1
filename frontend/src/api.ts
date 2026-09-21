import type {
  AnalyzeResult,
  Circuit,
  EvaluateResult,
  Level,
  VerifyResult
} from './types';

/**
 * 后端 API 客户端。求值、环检测、真值表、SOP、卡诺图、关卡验证
 * 全部经由后端的同一套算法内核，前端只做展示与交互。
 */

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `请求失败（${res.status}）`, res.status);
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `请求失败（${res.status}）`, res.status);
  }
  return data as T;
}

export const api = {
  evaluate(circuit: Circuit) {
    return post<EvaluateResult>('/evaluate', circuit);
  },
  analyze(circuit: Circuit) {
    return post<AnalyzeResult>('/analyze', { circuit });
  },
  truthTableCsv(circuit: Circuit) {
    return post<{ csv: string; filename: string }>('/truth-table/csv', { circuit });
  },
  levels() {
    return get<{ levels: Level[] }>('/levels');
  },
  verify(circuit: Circuit, levelId: string) {
    return post<VerifyResult>('/verify', { circuit, levelId });
  }
};
