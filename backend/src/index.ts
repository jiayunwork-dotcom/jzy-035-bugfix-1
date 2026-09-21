import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { evaluate } from './evaluate.js';
import { validateCircuit } from './graph.js';
import {
  buildTruthTable,
  extractAllSop,
  truthTableToCsv
} from './truthTable.js';
import { buildAllKarnaughMaps } from './karnaugh.js';
import { getLevel, LEVELS, verifyCircuit } from './levels.js';
import type { AnalyzeResult, Circuit } from './types.js';

const PORT = Number(process.env.PORT ?? 3001);

/* ------------------------------ HTTP 小框架 ------------------------------ */

type JsonHandler = (body: any, query: URLSearchParams) => unknown | Promise<unknown>;

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(payload);
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('请求体过大（上限 2MB）'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isCircuit(x: unknown): x is Circuit {
  return (
    !!x &&
    typeof x === 'object' &&
    Array.isArray((x as Circuit).nodes) &&
    Array.isArray((x as Circuit).edges)
  );
}

const routes = new Map<string, { method: string; handler: JsonHandler }>();

function route(method: string, path: string, handler: JsonHandler) {
  routes.set(path, { method, handler });
}

/* --------------------------------- 路由 ---------------------------------- */

route('POST', '/api/evaluate', (body) => {
  if (!isCircuit(body)) throw new Error('请求体需要是电路对象 {nodes, edges}');
  return evaluate(body);
});

route('POST', '/api/truth-table', (body) => {
  if (!isCircuit(body.circuit)) throw new Error('需要 circuit 字段');
  return buildTruthTable(body.circuit, {
    inputIds: body.inputIds,
    outputIds: body.outputIds
  });
});

route('POST', '/api/truth-table/csv', (body) => {
  if (!isCircuit(body.circuit)) throw new Error('需要 circuit 字段');
  const table = buildTruthTable(body.circuit, {
    inputIds: body.inputIds,
    outputIds: body.outputIds
  });
  // CSV 走 JSON 信封返回，前端自行触发下载
  return { csv: truthTableToCsv(table), filename: 'truth-table.csv' };
});

route('POST', '/api/analyze', (body) => {
  if (!isCircuit(body.circuit)) throw new Error('需要 circuit 字段');
  const table = buildTruthTable(body.circuit, {
    inputIds: body.inputIds,
    outputIds: body.outputIds
  });
  const expressions = extractAllSop(table);
  let karnaughMaps: AnalyzeResult['karnaughMaps'];
  if (table.inputNames.length >= 2 && table.inputNames.length <= 4) {
    karnaughMaps = buildAllKarnaughMaps(table);
  } else {
    karnaughMaps = [];
  }
  const result: AnalyzeResult = { truthTable: table, expressions, karnaughMaps };
  return result;
});

route('POST', '/api/validate', (body) => {
  if (!isCircuit(body)) throw new Error('请求体需要是电路对象 {nodes, edges}');
  return { issues: validateCircuit(body) };
});

route('GET', '/api/levels', () => ({ levels: LEVELS }));

route('POST', '/api/verify', (body) => {
  if (!isCircuit(body.circuit)) throw new Error('需要 circuit 字段');
  const level = typeof body.levelId === 'string' ? getLevel(body.levelId) : undefined;
  if (!level) throw new Error(`未知关卡 id：${String(body.levelId)}`);
  return verifyCircuit(body.circuit, level);
});

route('GET', '/api/health', () => ({ status: 'ok', service: 'logiclab-backend' }));

/* -------------------------------- 启动 ----------------------------------- */

/**
 * 创建 HTTP 服务但不立即监听，方便测试按需绑定随机端口。
 */
export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    const match = routes.get(url.pathname);
    if (!match || match.method !== req.method) {
      sendJson(res, 404, { error: `未找到路由 ${req.method ?? ''} ${url.pathname}` });
      return;
    }

    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const data = await match.handler(body, url.searchParams);
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

/* -------------------------------- 启动 ----------------------------------- */

// 仅在作为入口直接运行时监听；被测试 import 时不自动启动
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createApp();
  server.listen(PORT, () => {
    const addr = server.address() as AddressInfo;
    console.log(`LogicLab 后端算法服务监听 http://0.0.0.0:${addr.port}`);
  });
}
