# 结构哨兵 / structured-runner

> **面向 Schema 的结构化输出“强一致”执行器**  
> 通过**校验**、**纠偏重写**与**字段级重试**（支持**并行**），让任意模型的 JSON **可直接用于生产**；同时支持**回退模型链**（小模型→大模型）。

---

## 目录
- [简介](#简介)
- [为什么需要结构哨兵](#为什么需要结构哨兵)
- [核心特性](#核心特性)
- [架构](#架构)
- [应用场景](#应用场景)
  - [最适用的场景](#最适用的场景)
  - [不适用的场景](#不适用的场景)
- [快速开始](#快速开始)
- [API](#api)
- [端到端案例](#端到端案例)
  - [1) 电商商品解析（Zod）](#1-电商商品解析zod)
  - [2) 发票行项（Ajv--JSON-Schema）](#2-发票行项ajv--json-schema)
  - [3) 日志 → 结构化事件（并行字段修复）](#3-日志--结构化事件并行字段修复)
  - [4) 回退模型链的实际效果](#4-回退模型链的实际效果)
- [工作原理](#工作原理)
- [进阶配置](#进阶配置)
- [自定义 Provider（非 OpenAI 风格）](#自定义-provider非-openai-风格)
- [常见问题](#常见问题)
- [路线图](#路线图)
- [许可证](#许可证)

---

## 简介
**结构哨兵**（structured-runner）是一个轻量的 TypeScript 库，用于**保障 LLM 输出严格符合结构化 Schema**（支持 **Zod** 与 **JSON Schema/Ajv**）。  
当输出不规范时，库会自动发起**纠偏重写**与**字段级补齐（可并行）**；若多次失败，还会按**回退模型链**逐级尝试，直到成功或给出详细失败报告。

---

## 为什么需要结构哨兵
真实模型输出常见问题：
- JSON 前后夹杂解释文字 / Markdown 围栏；
- 字段类型不匹配（数字/布尔被写成字符串）；
- 字段缺失、多余字段、非法枚举等。

过去你可能靠“土办法”修：正则+手写校验+特殊分支。  
**结构哨兵**把这段“最后一公里”标准化，让下游永远获得**可靠的对象**或**透明的错误报告**。

---

## 核心特性
- **Schema-first**：先定义结构，再生成/修复（Zod 或 JSON Schema/Ajv）。
- **严格校验**：不合规就报错，错误路径精确。
- **自动纠偏**：基于 Schema 摘要与错误点生成最小修复。
- **字段级重试**：只修问题字段，支持**并行**修复 + **深度合并**。
- **回退模型链**：失败自动切换到更强模型。
- **Provider 无关**：开箱即用 OpenAI 兼容；30 行即可接入任意后端。
- **可观测**：`attempts[]` 全链路日志，便于排查与指标统计。

---

## 架构
```
structured-runner/
├─ packages/core
│  ├─ runner.ts                # 主流程：校验/纠偏/字段修复/报告
│  ├─ providers/openai.ts      # OpenAI 兼容（可切 baseURL 到 OpenRouter/DeepSeek/Ollama）
│  ├─ providers/http-json.ts   # 30 行的自定义后端模板
│  ├─ strategies/              # validate（Zod/Ajv）、repair（rewrite/field）
│  └─ utils/                   # JSON 提取、围栏清洗、深度合并
└─ examples/basic-node         # 可跑示例
```

---

## 应用场景

### 最适用的场景
- **后端服务**：对外/对下游输出**严格 JSON**（写库、对接 REST/GraphQL、ETL/BI）。
- **RAG/Agent 编排**：异构工具与多模型输出，统一为**稳定契约**。
- **抽取任务**：票据/发票/简历/商品/日志文本 → 结构化对象。
- **批处理管道**：通过自动修复与重试，**显著提高成功率**。
- **低延迟前端**：多字段错误时，**并行修复**可有效降低尾部时延。

### 不适用的场景
- 只需要**自由文本**或不要求结构化。
- 对正确性不敏感的临时 Demo。
- 每一步修复都必须**人工审批**（可在外层叠加审批流程，本库不内置）。

---

## 快速开始
```bash
npm install
npm run build

# OpenAI（默认）
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
npm run example:basic
```

DeepSeek：
```bash
export DEEPSEEK_API_KEY=sk-...
export DEEPSEEK_MODEL=deepseek-chat
npm run -w basic-node start:deepseek
```

Ollama（本地）：
```bash
# ollama pull llama3.1
export OLLAMA_MODEL=llama3.1
npm run -w basic-node start:ollama
```

切换到 **Ajv/JSON Schema**（示例）：
```bash
VALIDATOR=ajv npm run example:basic
```

**回退模型链**：
```bash
export FALLBACK_MODELS="gpt-4o,anthropic/claude-3.5-sonnet"
npm run example:basic
```

关闭**并行字段修复**（默认开启）：
```bash
export PARALLEL_FIELD_RETRY=false
npm run example:basic
```

---

## API
```ts
runWithSchema<T>(options: StructuredRunnerOptions<T>): Promise<StructuredRunnerResult<T>>
```

关键参数：
- `schema`：**Zod** 或 **JSON Schema**（`validator: 'zod' | 'ajv'`）。
- `provider`：LLM 后端（内置 `OpenAIProvider`；也可自定义）。
- `model` / `fallbackModels`：主模型与回退链。
- `fieldRetry` / `parallelFieldRetry`：字段级修复与并行控制。
- `strictJsonOnly`：强制只接受 JSON（并带提取后备策略）。
- 全量类型见 `packages/core/src/types.ts`。

---

## 端到端案例

### 1) 电商商品解析（Zod）

**常见不规范输出：**
```json
{
  "name": "新款耳机",
  "price": "299元",
  "tags": ["音频", "无线"],
  "inStock": "现货"
}
```
或带说明与围栏：
```
好的，以下是 JSON：

```json
{ "name": "新款耳机", "price": 299, "tags": ["音频","无线"], "inStock": true }
```
```

**目标 Zod Schema：**
```ts
const Product = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  tags: z.array(z.string()).default([]),
  inStock: z.boolean(),
});
```

**修复后（通过校验）：**
```json
{
  "name": "新款耳机",
  "price": 299,
  "tags": ["音频", "无线"],
  "inStock": true
}
```

---

### 2) 发票行项（Ajv / JSON Schema）

**JSON Schema（简化）**
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["invoiceNo", "items", "currency", "total"],
  "properties": {
    "invoiceNo": { "type": "string", "minLength": 3 },
    "currency":  { "type": "string", "enum": ["USD","EUR","CNY"] },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["desc","qty","unitPrice"],
        "properties": {
          "desc": { "type": "string" },
          "qty": { "type": "number", "minimum": 1 },
          "unitPrice": { "type": "number", "minimum": 0 }
        },
        "additionalProperties": false
      }
    },
    "total": { "type": "number", "minimum": 0 }
  }
}
```

**模型不规范输出：**
```json
{
  "invoiceNo": "A-19",
  "currency": "usd",
  "items": [
    { "desc": "转接头", "qty": "2", "unitPrice": 19.99 },
    { "desc": "线缆", "qty": 1, "unitPrice": 9.5 }
  ],
  "total": 49.48,
  "note": "Thanks!"
}
```

**自动修复后：**
```json
{
  "invoiceNo": "A-19",
  "currency": "USD",
  "items": [
    { "desc": "转接头", "qty": 2, "unitPrice": 19.99 },
    { "desc": "线缆", "qty": 1, "unitPrice": 9.5 }
  ],
  "total": 49.48
}
```

---

### 3) 日志 → 结构化事件（并行字段修复）

**输入日志：**
```
[WARN] 2025-09-15T10:22:31Z api-gw#42 route=/orders/checkout user=__anon latency=1.2s code=504 trace=abcd1234
```

**常见问题输出：**
```json
{
  "level": "WARN",
  "timestamp": "2025-09-15T10:22:31Z",
  "service": "api-gw",
  "route": "/orders/checkout",
  "userId": "__anon",
  "latencyMs": "1200",
  "status": "504",
  "traceId": "abcd1234",
  "extra": "..."
}
```

**Zod Schema：**
```ts
const LogEvent = z.object({
  level: z.enum(["INFO","WARN","ERROR"]),
  timestamp: z.string(),
  service: z.string(),
  route: z.string(),
  userId: z.string(),
  latencyMs: z.number().nonnegative(),
  status: z.number().int(),
  traceId: z.string(),
});
```

**并行修复**
当 `latencyMs` 与 `status` 同时出错时，触发**两路并行**字段修复 → **合并** → 统一再校验，降低总时延。

**最终结果：**
```json
{
  "level": "WARN",
  "timestamp": "2025-09-15T10:22:31Z",
  "service": "api-gw",
  "route": "/orders/checkout",
  "userId": "__anon",
  "latencyMs": 1200,
  "status": 504,
  "traceId": "abcd1234"
}
```

---

### 4) 回退模型链的实际效果
```bash
export OPENAI_MODEL=gpt-4o-mini
export FALLBACK_MODELS="gpt-4o,anthropic/claude-3.5-sonnet"
npm run example:basic
```
流程：先尝试 `gpt-4o-mini`；若多次修复仍失败，切 `gpt-4o`，仍不行再切 `claude-3.5-sonnet`。每个模型内部都执行“初次→修复循环→（可选）字段修复”。

---

## 工作原理
1. **初次调用**：尽量启用 JSON-only（若后端支持）。  
2. **解析/提取**：从围栏/混合文本中抓取第一段可解析 JSON。  
3. **校验**：Zod/Ajv 产出**精确路径**的错误信息。  
4. **纠偏重写**：带上 Schema 摘要与错误路径，要求“只输出 JSON”。  
5. **字段级修复**：只修出错字段；可**并行**提升速度。  
6. **模型回退**：当前模型失败则按链路切换。  
7. **返回**：最终对象 + `attempts[]` 透明日志。

---

## 进阶配置
- **校验器**：`validator: 'zod' | 'ajv'`；Schema 分别为 Zod / JSON Schema。  
- **并行合并策略**：默认**深度合并**字段补丁；你可按需改为“只信目标字段”等更严格策略。  
- **可观测性**（规划）：`onAttempt`、`onRepair`、`onFieldRetry` 等钩子，接入 Langfuse/OTel。  
- **预算/路由**（规划）：token/成本守护与模型自适应路由。

---

## 自定义 Provider（非 OpenAI 风格）
实现 `Provider.chat()` 即可。示例：
```ts
export class HttpJSONProvider implements Provider {
  constructor(private cfg: { endpoint: string; headers?: Record<string,string> }) {}
  async chat(input) {
    const combined = input.system ? `${input.system}

${input.prompt}` : input.prompt;
    const res = await fetch(this.cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.cfg.headers ?? {}) },
      body: JSON.stringify({ prompt: combined }),
      signal: input.abortSignal as any,
    });
    if (!res.ok) throw new Error(`HttpJSONProvider HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();              // 期望 { output: string }
    return { text: String(data.output ?? '') }; // 返回原始文本（理想为 JSON）
  }
}
```

---

## 常见问题
**一定能成功吗？**  
不能保证。若模型拒绝或能力不足，会返回 `ok: false` 与透明的失败报告。但常见任务配合修复与字段级重试，成功率很高。

**会改变语义吗？**  
修复目标是**满足 Schema 且最小修改**。建议配合严谨的 Schema 与单测约束业务语义。

**浏览器能用吗？**  
库本身可打包到浏览器，但请勿在前端暴露密钥。建议通过代理或本地网关（如 Ollama 的兼容端点）。

---

## 路线图
- 已完成：Ajv 适配；回退模型链；并行字段修复  
- 规划中：更智能的补丁合并；自检与结构化 diff；可观测性钩子；预算/路由

---

## 许可证
MIT
