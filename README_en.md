# README (English) — structured-runner (*Chinese name: 结构哨兵 / Structured Runner*)

> **Schema-first, auto-repair executor for LLM structured outputs.**  
> Make any model’s JSON **production-ready** with validation, repair, and field-level retries (including **parallel** fixes), plus **fallback model chains**.

---

## Table of Contents
- [Overview](#overview)
- [Why structured-runner?](#why-structured-runner)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Use Cases](#use-cases)
  - [Where it shines](#where-it-shines)
  - [When not to use it](#when-not-to-use-it)
- [Quick Start](#quick-start)
- [API](#api)
- [End-to-End Examples](#end-to-end-examples)
  - [1) E-commerce product parsing (Zod)](#1-e-commerce-product-parsing-zod)
  - [2) Invoice line items (Ajv / JSON Schema)](#2-invoice-line-items-ajv--json-schema)
  - [3) Logs → Structured events (parallel field repair)](#3-logs--structured-events-parallel-field-repair)
  - [4) Fallback model chain in practice](#4-fallback-model-chain-in-practice)
- [How It Works](#how-it-works)
- [Advanced Configuration](#advanced-configuration)
- [Custom Providers (non-OpenAI backends)](#custom-providers-non-openai-backends)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview
`structured-runner` (Chinese name: **结构哨兵**) is a tiny TypeScript library that **guarantees valid structured outputs** from LLMs.

It takes a **schema** (Zod or Ajv/JSON Schema) and a **prompt**, calls your model through a pluggable **Provider** (OpenAI-compatible by default), and **auto-repairs** the output until it passes validation—or returns a detailed, auditable report.

---

## Why structured-runner?
Real-world LLM outputs are often **not** directly consumable:
- Extra prose or Markdown fences around JSON,
- Wrong types (number as string, boolean as “yes/no”),
- Missing fields, unexpected properties, invalid enums.

Rather than writing ad-hoc regex and validators over and over, use one function call that **always** returns either:
- a **validated object** matching your schema, or
- a **rich report** telling you exactly what failed (and what was attempted).

---

## Key Features
- **Schema-first**: Define structure with **Zod** or **JSON Schema (Ajv)**.
- **Strict validation**: Reject anything non-conforming with pinpointed error paths.
- **Auto repair**: Iterative **rewrite** using schema hints + error messages.
- **Field-level retries**: Only fix broken fields; supports **parallel** repairs with **deep merge**.
- **Fallback models**: Try a **chain** of models (small → large) automatically.
- **Provider-agnostic**: OpenAI-compatible out of the box; add any backend via a ~30-line `Provider`.
- **Clear observability**: `attempts[]` log for every step (initial, repair, field fixes).

---

## Architecture
```
structured-runner/
├─ packages/
│  └─ core/
│     ├─ src/
│     │  ├─ runner.ts           # orchestrates validate/repair/retry/report
│     │  ├─ providers/
│     │  │  ├─ openai.ts        # OpenAI-compatible (baseURL switchable: OpenAI, OpenRouter, DeepSeek, Ollama)
│     │  │  └─ http-json.ts     # 30-line example for arbitrary HTTP backends
│     │  ├─ strategies/         # validate (Zod & Ajv), repair (rewrite/field)
│     │  └─ utils/              # JSON extraction, code fences, deep merge
└─ examples/
   └─ basic-node/               # runnable Node example
```

---

## Use Cases

### Where it shines
- **Backends** that must **return valid JSON** to downstream systems (DB writes, ETL, REST/GraphQL).
- **RAG/Agents** with multiple tools/models—normalize outputs to a **stable contract**.
- **Extraction**: receipts/invoices/resumes/products/logs → strict objects.
- **Batch pipelines**: boost overall success rate with repair + retry.
- **Low-latency UIs**: turn on **parallel** field repairs to reduce tail latency under many-field failures.

### When not to use it
- You only need **free-form creative text**.
- Correctness isn’t important (e.g., throwaway demos).
- Every fix must be **human-approved** (you can wrap this library with your own approval gate).

---

## Quick Start
```bash
npm install
npm run build

# OpenAI (default)
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
npm run example:basic
```

DeepSeek:
```bash
export DEEPSEEK_API_KEY=sk-...
export DEEPSEEK_MODEL=deepseek-chat
npm run -w basic-node start:deepseek
```

Ollama (local):
```bash
# ollama pull llama3.1
export OLLAMA_MODEL=llama3.1
npm run -w basic-node start:ollama
```

Switch validator to **Ajv/JSON Schema**:
```bash
VALIDATOR=ajv npm run example:basic
```

Add a **fallback model chain**:
```bash
export FALLBACK_MODELS="gpt-4o,anthropic/claude-3.5-sonnet"
npm run example:basic
```

Disable **parallel field repair** (default is on):
```bash
export PARALLEL_FIELD_RETRY=false
npm run example:basic
```

---

## API
```ts
runWithSchema<T>(options: StructuredRunnerOptions<T>): Promise<StructuredRunnerResult<T>>
```

Key options:
- `schema`: **Zod** schema or **JSON Schema** object (`validator: 'zod' | 'ajv'`).
- `provider`: your LLM backend (`OpenAIProvider` or custom).
- `model`, `fallbackModels`: active model + escalation chain.
- `fieldRetry`, `parallelFieldRetry`: fine/faster repairs.
- `strictJsonOnly`: require pure JSON (with extraction fallback).
- Full types: `packages/core/src/types.ts`.

---

## End-to-End Examples

### 1) E-commerce product parsing (Zod)

**User prompt**
```
Structure this product: "New headphones, 24h battery; price 299; in stock; tags: audio, wireless".
Return JSON only.
```

**Common malformed outputs**
```json
{
  "name": "New headphones",
  "price": "299",
  "tags": ["audio", "wireless"],
  "inStock": "yes"
}
```
_or with prose & fences_
```
Sure! Here's the JSON:

```json
{ "name":"New headphones", "price":299, "tags":["audio","wireless"], "inStock":true }
```
```

**Target Zod schema**
```ts
const Product = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  tags: z.array(z.string()).default([]),
  inStock: z.boolean(),
});
```

**What structured-runner does**
1) Ask for JSON-only and parse.  
2) If invalid, **repair** with schema hints + error paths.  
3) If still invalid, **field-level retry** (possibly **parallel**) to minimally fix just `price` and `inStock`.

**Final validated result**
```json
{
  "name": "New headphones",
  "price": 299,
  "tags": ["audio", "wireless"],
  "inStock": true
}
```

---

### 2) Invoice line items (Ajv / JSON Schema)

**JSON Schema (Ajv)**
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

**Messy model output**
```json
{
  "invoiceNo": "A-19",
  "currency": "usd",
  "items": [
    { "desc": "Adapter", "qty": "2", "unitPrice": 19.99 },
    { "desc": "Cable", "qty": 1, "unitPrice": 9.5 }
  ],
  "total": 49.48,
  "note": "Thanks!"
}
```

**Auto-repair**
- Delete `note`, coerce `qty` to number, normalize `currency` to `"USD"`.  
- If still invalid, **per-field** retry focuses only on the failing paths.

**Validated result**
```json
{
  "invoiceNo": "A-19",
  "currency": "USD",
  "items": [
    { "desc": "Adapter", "qty": 2, "unitPrice": 19.99 },
    { "desc": "Cable", "qty": 1, "unitPrice": 9.5 }
  ],
  "total": 49.48
}
```

---

### 3) Logs → Structured events (parallel field repair)

**Prompt (free-form logs)**
```
Parse this log line:
"[WARN] 2025-09-15T10:22:31Z api-gw#42 route=/orders/checkout user=__anon latency=1.2s code=504 trace=abcd1234"
Return JSON only.
```

**Typical malformed output**
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

**Zod schema**
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

**Parallel repairs**
If both `latencyMs` and `status` fail, runner fires **two parallel** field fixes, merges the patches, and re-validates—cutting round trips.

**Validated result**
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

### 4) Fallback model chain in practice
```bash
export OPENAI_MODEL=gpt-4o-mini
export FALLBACK_MODELS="gpt-4o,anthropic/claude-3.5-sonnet"
npm run example:basic
```
Behavior:
- Try `gpt-4o-mini`. If repair fails after `maxAttempts`, escalate to `gpt-4o`, then to `claude-3.5-sonnet`.
- Each model runs: initial → repair loops → (optional) field repairs.

---

## How It Works
1. **Initial call** (requests JSON-only when supported).  
2. **Parse/extract** JSON from fenced/mixed outputs.  
3. **Validate** via Zod or Ajv (precise error paths).  
4. **Repair**: prompt the model with schema hints + errors, ask for JSON only.  
5. **Field-level repair**: fix only the broken paths (optionally **parallel**).  
6. **Fallback models**: escalate through your chain if still failing.  
7. **Return**: validated object + detailed `attempts[]` log.

---

## Advanced Configuration
- **Validators**: `validator: 'zod' | 'ajv'` (provide Zod schema or JSON Schema).
- **Parallel merge policy**: we **deep-merge** field patches; you can fork for stricter policies.
- **Observability** *(planned)*: hooks like `onAttempt`, `onRepair`, `onFieldRetry`.
- **Budgeting/routing** *(planned)*: token/cost guards, adaptive model routing.

---

## Custom Providers (non-OpenAI backends)
Implement the `Provider` interface once (~30 lines). Example:
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
    const data = await res.json();              // expect { output: string }
    return { text: String(data.output ?? '') }; // return raw model text (ideally JSON)
  }
}
```

---

## FAQ
**Does it guarantee success?**  
No; if a model refuses or lacks capability, you’ll get `ok: false` + a transparent report. In practice, common tasks succeed at high rates with repair + field retries.

**Will repairs change meaning?**  
Repairs target **schema compliance** with **minimal edits**. Keep schemas tight; add tests for your domain.

**Can I run it in the browser?**  
Yes, but **don’t expose API keys**. Use a proxy or local gateways (Ollama’s OpenAI-compatible endpoint).

---

## Roadmap
- Done: Ajv adapter; fallback model chain; parallel field repairs
- Next: smarter patch-merge; self-check prompts; Langfuse/OpenTelemetry hooks; budgeting

---

## License
MIT
