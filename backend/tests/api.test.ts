import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';

import { createApp } from '../src/index.js';
import type { Server as HttpServer } from 'node:http';

let base: string;
let app: HttpServer;

beforeAll(async () => {
  app = createApp();
  await new Promise<void>((resolve) => {
    app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = app.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  app.close();
});

async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, json: await res.json() };
}

describe('HTTP API 集成', () => {
  it('GET /api/health', async () => {
    const r = await get('/api/health');
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('ok');
  });

  it('GET /api/levels 返回关卡列表', async () => {
    const r = await get('/api/levels');
    expect(Array.isArray(r.json.levels)).toBe(true);
    expect(r.json.levels.length).toBeGreaterThanOrEqual(5);
  });

  it('POST /api/evaluate 多级电路返回真实电平', async () => {
    const circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, value: 1 },
        { id: 'b', type: 'input', x: 0, y: 40, value: 0 },
        { id: 'g', type: 'xor', x: 120, y: 20 },
        { id: 'y', type: 'output', x: 240, y: 20 }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'g', inputPort: 0 },
        { id: 'e2', source: 'b', target: 'g', inputPort: 1 },
        { id: 'e3', source: 'g', target: 'y', inputPort: 0 }
      ]
    };
    const r = await post('/api/evaluate', circuit);
    expect(r.status).toBe(200);
    expect(r.json.cyclic).toBe(false);
    expect(r.json.nodeValues.g).toBe(1);
    expect(r.json.outputLights.y).toBe(1);
  });

  it('POST /api/analyze 一次拿到真值表、SOP 与卡诺图', async () => {
    const circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: 0 },
        { id: 'b', type: 'input', x: 0, y: 40, label: 'B', value: 0 },
        { id: 'g', type: 'and', x: 120, y: 20 },
        { id: 'y', type: 'output', x: 240, y: 20, label: 'Y' }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'g', inputPort: 0 },
        { id: 'e2', source: 'b', target: 'g', inputPort: 1 },
        { id: 'e3', source: 'g', target: 'y', inputPort: 0 }
      ]
    };
    const r = await post('/api/analyze', { circuit });
    expect(r.status).toBe(200);
    expect(r.json.truthTable.rowCount).toBe(4);
    expect(r.json.expressions[0].canonical).toBe('A·B');
    expect(r.json.karnaughMaps[0].simplified).toBe('A·B');
  });

  it('POST /api/analyze 支持只穷举勾选的输入，其余开关按当前电平固定', async () => {
    // Y = A·C，三个输入开关 A、B、C，B 钉在 0；只枚举 A、C
    const circuit = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: 0 },
        { id: 'b', type: 'input', x: 0, y: 40, label: 'B', value: 0 },
        { id: 'c', type: 'input', x: 0, y: 80, label: 'C', value: 0 },
        { id: 'g', type: 'and', x: 120, y: 40 },
        { id: 'y', type: 'output', x: 240, y: 40, label: 'Y' }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'g', inputPort: 0 },
        { id: 'e2', source: 'c', target: 'g', inputPort: 1 },
        { id: 'e3', source: 'g', target: 'y', inputPort: 0 }
      ]
    };
    const r = await post('/api/analyze', { circuit, inputIds: ['a', 'c'] });
    expect(r.status).toBe(200);
    const tt = r.json.truthTable;
    expect(tt.inputNames).toEqual(['A', 'C']);
    expect(tt.rowCount).toBe(4);
    expect(tt.rows.map((row: { outputs: number[] }) => row.outputs[0])).toEqual([0, 0, 0, 1]);
    expect(r.json.expressions[0].canonical).toBe('A·C');
    expect(r.json.karnaughMaps[0].simplified).toBe('A·C');

    // 未选中的开关 B 钉在 1 且确实参与运算：改成 Y = A·B·C（两级与门），
    // 只枚举 A、C 时结果应为 A·C（B=1），证明枚举位没被错配给 B。
    const circuit3 = {
      nodes: [
        { id: 'a', type: 'input', x: 0, y: 0, label: 'A', value: 0 },
        { id: 'b', type: 'input', x: 0, y: 40, label: 'B', value: 1 },
        { id: 'c', type: 'input', x: 0, y: 80, label: 'C', value: 0 },
        { id: 'g1', type: 'and', x: 120, y: 20 },
        { id: 'g2', type: 'and', x: 240, y: 40 },
        { id: 'y', type: 'output', x: 360, y: 40, label: 'Y' }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'g1', inputPort: 0 },
        { id: 'e2', source: 'b', target: 'g1', inputPort: 1 },
        { id: 'e3', source: 'g1', target: 'g2', inputPort: 0 },
        { id: 'e4', source: 'c', target: 'g2', inputPort: 1 },
        { id: 'e5', source: 'g2', target: 'y', inputPort: 0 }
      ]
    };
    const r3 = await post('/api/truth-table', { circuit: circuit3, inputIds: ['a', 'c'] });
    expect(r3.status).toBe(200);
    expect(r3.json.inputNames).toEqual(['A', 'C']);
    expect(r3.json.rows.map((row: { outputs: number[] }) => row.outputs[0])).toEqual([0, 0, 0, 1]);
  });

  it('反馈环电路：/api/evaluate 返回 cyclic=true，/api/verify 不放行', async () => {
    const circuit = {
      nodes: [
        { id: 'g1', type: 'nand', x: 0, y: 0 },
        { id: 'g2', type: 'nand', x: 120, y: 0 },
        { id: 'y', type: 'output', x: 240, y: 0 }
      ],
      edges: [
        { id: 'e1', source: 'g1', target: 'g2', inputPort: 0 },
        { id: 'e2', source: 'g2', target: 'g1', inputPort: 0 },
        { id: 'e3', source: 'g2', target: 'y', inputPort: 0 }
      ]
    };
    const ev = await post('/api/evaluate', circuit);
    expect(ev.json.cyclic).toBe(true);
    expect(ev.json.cycleNodeIds.length).toBeGreaterThan(0);

    // 给验证补一个输入开关凑数（关卡要 1 输入）—— 重点是环仍拒绝
    const withInput = {
      nodes: [...circuit.nodes, { id: 'a', type: 'input', x: 0, y: 120, value: 0 }],
      edges: [...circuit.edges, { id: 'e4', source: 'a', target: 'g1', inputPort: 1 }]
    };
    const vf = await post('/api/verify', { circuit: withInput, levelId: 'not-gate' });
    expect(vf.json.passed).toBe(false);
    expect(vf.json.evaluable).toBe(false);
  });

  it('非法 JSON / 错误路由返回 4xx', async () => {
    const res = await fetch(`${base}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json'
    });
    expect(res.status).toBe(400);
    const nf = await get('/api/nope');
    expect(nf.status).toBe(404);
  });
});
