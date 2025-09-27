let core: any;
try {
  core = await import('@structured-runner/core');
} catch {
  core = await import('../../../packages/core/src/index.ts');
}
const { OpenAIProvider, runWithSchema } = core;

import { z } from 'zod';

const isDeepseek = !!process.env.DEEPSEEK;
const isOllama = !!process.env.OLLAMA;
const useAjv = process.env.VALIDATOR === 'ajv';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || 'dummy',
  baseURL: isDeepseek ? (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
        : isOllama   ? (process.env.OLLAMA_BASE_URL   || 'http://localhost:11434/v1')
        : (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
});

const model =
  isDeepseek ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat') :
  isOllama   ? (process.env.OLLAMA_MODEL   || 'llama3.1') :
               (process.env.OPENAI_MODEL   || 'gpt-4o-mini');

const ProductZod = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  tags: z.array(z.string()).default([]),
  inStock: z.boolean(),
});

const ProductJSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "price", "tags", "inStock"],
  properties: {
    name: { type: "string", minLength: 1 },
    price: { type: "number", minimum: 0 },
    tags: { type: "array", items: { type: "string" }, default: [] },
    inStock: { type: "boolean" }
  }
};

async function main() {
  const res = await runWithSchema<any>({
    provider,
    schema: useAjv ? ProductJSONSchema : ProductZod,
    validator: useAjv ? 'ajv' : 'zod',
    system: 'You are a strict JSON generator. Output must be JSON and match the schema.',
    user: `Structure this product description: {{desc}}. Return JSON only.`,
    input: { desc: 'New headphones, 24h battery, price 299, in stock; tags: audio, wireless' },
    model,
    fallbackModels: (process.env.FALLBACK_MODELS || '').split(',').filter(Boolean),
    maxAttempts: Number(process.env.MAX_ATTEMPTS || 3),
    fieldRetry: process.env.FIELD_RETRY !== 'false',
    parallelFieldRetry: process.env.PARALLEL_FIELD_RETRY !== 'false',
    strictJsonOnly: process.env.STRICT_JSON_ONLY !== 'false'
  });

  console.log('=== RESULT ===');
  console.log(JSON.stringify(res, null, 2));
}
main().catch(err => { console.error(err); process.exit(1); });
