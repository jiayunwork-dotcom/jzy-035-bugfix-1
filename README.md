# LogicLab · 组合逻辑电路实验台

面向《计算机组成原理》组合逻辑章节的教学工具：学生在浏览器里拖拽搭电路，
一拨开关，信号按拓扑顺序一级级传播，导线和指示灯实时变色；后端同一套求值
内核还能自动穷举**真值表**、抽取 **SOP 布尔表达式**、做 **卡诺图化简**，
并内置一组**教学关卡**让学生自助验证。

- 前端：React 18 + TypeScript + Vite（SVG 画布）
- 后端：Node.js 20 + TypeScript，零运行时依赖，内置 HTTP/JSON 服务
- 求值、反馈环检测、真值表穷举、SOP 提取、卡诺图化简、关卡判定全部在**后端**
- 一键 Docker 启动（基础镜像 `node:20-alpine`）

## 一键启动（Docker）

```bash
docker compose up --build
```

打开 http://localhost:8080 即可。前端容器同时把 `/api/*` 反代到后端容器，
浏览器里没有跨域问题。

## 本地开发

需要 Node.js 20+。

```bash
# 终端 1：后端算法服务（http://localhost:3001）
cd backend
npm install
npm run dev        # tsc -w，另开一次 npm run build && node dist/index.js 跑服务
# 或直接：
npm run build && npm start

# 终端 2：前端（http://localhost:5173，/api 自动代理到 3001）
cd frontend
npm install
npm run dev
```

生产模式只跑前端容器内的零依赖静态服务器（`frontend/server.cjs`），
它既托管 `dist/` 也反代 `/api`。

## 操作说明

| 操作 | 方式 |
| --- | --- |
| 放置元件 | 从左侧工具栏拖到画布 |
| 移动 / 选中 | 鼠标拖动元件；Shift 加选；点空白取消 |
| 删除 | 选中元件或导线后按 `Delete` / `Backspace` |
| 连线 | 从元件**输出口（右侧圆点）**拉到另一元件的**输入口（左侧圆点）**；落空或非法自动取消 |
| 切换输入 | 点击输入开关上的拨片，在 0/1 间切换 |
| 缩放 / 平移 | 滚轮缩放（以鼠标为锚点）；拖空白处平移 |
| 撤销 / 重做 | 工具栏按钮或 `Ctrl+Z` / `Ctrl+Y`、`Ctrl+Shift+Z`（保留 100 步） |
| 改名 | 选中一个输入/输出后点顶栏「改名」 |
| 保存 / 读取 | 元件类型、坐标、连线序列化为 JSON 文件导出 / 导入 |
| 分析 | 点「🔍 分析电路」：真值表（可导出 CSV）、SOP 表达式、2~4 变量卡诺图 |

分析面板可勾选**参与穷举的输入**：勾选的开关逐行穷举并对应真值表的列，
未勾选的开关保持其当前电平参与运算（全选即为常规完整真值表）。
| 关卡 | 「教学关卡」页选关，搭好后点「验证本关」 |

导线颜色：**红色 = 高电平 1，蓝色 = 低电平 0，灰色虚线 = 尚未算出**
（仅在检测到反馈环时出现，环上元件同时红框闪烁）。

## 反馈环是怎么处理的

组合逻辑不允许输出绕回输入。后端每次求值先做 **Kahn 拓扑排序**：
- 成功则按拓扑序从输入源逐级向后传播，每个门按自身逻辑计算；
- 失败则用 DFS 三色法回溯出具体环路上的元件 id 返回前端，**不输出任何猜测
  电平**，所有信号标记为 `unknown`（虚线），并提示「这是锁存器/时序电路的特征」。

## 后端 HTTP API

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /api/evaluate` | 实时求值（含环检测） |
| `POST /api/analyze` | 真值表 + SOP + 卡诺图一次返回 |
| `POST /api/truth-table` | 仅真值表 |
| `POST /api/truth-table/csv` | 真值表 CSV |

`analyze`、`truth-table`、`truth-table/csv` 均可在请求体带 `inputIds: string[]`：
只穷举列出的输入开关（列顺序即数组顺序），其余输入保持各自当前 `value` 参与运算；
省略或传全部 id 即穷举全部输入。
| `POST /api/validate` | 结构校验（端口方向/冲突/越界/自环） |
| `GET  /api/levels` | 关卡列表 |
| `POST /api/verify` | 用真实求值内核逐行判定关卡 |
| `GET  /api/health` | 健康检查 |

电路 JSON 结构：

```json
{
  "nodes": [
    { "id": "a", "type": "input", "x": 0, "y": 0, "label": "A", "value": 1 },
    { "id": "g", "type": "and", "x": 160, "y": 20 },
    { "id": "y", "type": "output", "x": 320, "y": 20, "label": "Y" }
  ],
  "edges": [
    { "id": "w1", "source": "a", "target": "g", "inputPort": 0 },
    { "id": "w2", "source": "g", "target": "y", "inputPort": 0 }
  ]
}
```

## 代码结构

```
backend/src/
  types.ts       # 电路/真值表/表达式/卡诺图/关卡数据模型
  gates.ts       # 七种门 + 输入开关/指示灯的逻辑与端口定义
  graph.ts       # 结构校验、邻接索引、Kahn 拓扑排序、DFS 找环
  evaluate.ts    # 拓扑求值内核（组合电路核心）
  truthTable.ts  # 2^n 穷举、CSV、Canonical SOP 提取
  karnaugh.ts    # 格雷码布局、环面矩形枚举、质蕴含项、最小集合覆盖
  levels.ts      # 内置关卡 + 基于真实求值的判定
  index.ts       # 零依赖 HTTP 路由
backend/tests/   # Vitest：门真值/拓扑传播/环/真值表/SOP/卡诺图/关卡/HTTP
frontend/src/
  types.ts / api.ts / geometry.ts / operations.ts / useHistory.ts
  components/     # Canvas、GateView、WireView、Toolbar、AnalyzePanel、
                  # KarnaughMapView、LevelPanel
  App.tsx         # 全局状态、撤销重做、序列化、求值联动
```

## 跑后端测试（关键行为都有自动化盯着）

```bash
cd backend
npm test
```

覆盖：各类门真值、多级电路按拓扑传播、反馈环被检测且拒绝给值、真值表逐行、
**只勾选部分输入穷举时列与开关严格对位、未选开关保持当前电平**（含与全选表
逐行对账的随机性质测试）、SOP 与真值表一致、2~4 变量卡诺图化简（含跨边界圈）、
关卡判定走真实求值、HTTP API 集成。共 98 个用例。

## 规模与边界约定

- 真值表变量数 ≥ 10（1024 行）时给出警告但**照常生成**；硬上限 20 个变量
  （约 105 万行），超过直接报错以免服务端被穷举拖垮。
- 卡诺图只支持 2~4 个输入变量；超过 4 个时前端说明原因（5 变量以上无法在
  平面保证所有逻辑相邻项几何相邻），真值表与 SOP 照常提供。
- 悬空输入口按默认低电平 0 参与求值。
