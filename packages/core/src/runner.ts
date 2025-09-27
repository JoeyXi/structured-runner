import { stripCodeFences } from './utils/fences';
import { extractFirstJsonBlock, safeJsonParse } from './utils/json';
import { genericValidate } from './strategies/validate';
import { repairByRewrite, fieldRetry } from './strategies/repair';
import { deepMerge } from './utils/merge';
import type { StructuredRunnerOptions, StructuredRunnerResult, AttemptLog } from './types';

const DEFAULT_MODEL = 'gpt-4o-mini';
type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };
function interpolate(tpl:string, vars?:Record<string,any>){ if(!vars) return tpl; return tpl.replace(/\{\{(\w+)\}\}/g,(_,k)=>String(vars[k]??'')); }

export async function runWithSchema<T>(opts: StructuredRunnerOptions<T>): Promise<StructuredRunnerResult<T>> {
  const { provider, schema, system, user, input, maxAttempts=3, fieldRetry:doFieldRetry=true, parallelFieldRetry=true, model=DEFAULT_MODEL, fallbackModels=[], temperature=0, strictJsonOnly=true, abortSignal, validator='zod', ajvInstance } = opts;
  const attempts: AttemptLog[] = [];
  const errors: { code:string; message:string }[] = [];
  const initialPrompt = interpolate(user, input);
  const models = [model, ...fallbackModels];

  for (const currentModel of models) {
    let raw = ''; let parsed: any = null;
    let v: ValidationResult<T> = { ok: false, issues: ['UNINITIALIZED'] };

    const first = await provider.chat({ model: currentModel, system, prompt: initialPrompt, temperature, jsonMode: true, abortSignal });
    raw = first.text ?? '';
    parsed = tryParse(raw, strictJsonOnly);
    v = genericValidate<T>({ validator, schema, data: parsed ?? {}, ajvInstance });
    attempts.push({ model: currentModel, step: 'initial', raw, parsed: parsed ?? undefined, valid: v.ok, issues: v.ok ? [] : v.issues });
    if (v.ok) return { ok: true, data: v.value as T, text: raw, attempts };

    let attempt = 1;
    while (!v.ok && attempt < maxAttempts) {
      const repaired = await repairByRewrite({ provider, model: currentModel, system, badOutput: raw, schemaHint: '[schema elided]', temperature });
      const repairedRaw = repaired;
      const repairedParsed = tryParse(repairedRaw, strictJsonOnly);
      const repairedV: ValidationResult<T> = genericValidate<T>({ validator, schema, data: repairedParsed ?? {}, ajvInstance });
      attempts.push({ model: currentModel, step: 'repair', raw: repairedRaw, parsed: repairedParsed ?? undefined, valid: repairedV.ok, issues: repairedV.ok ? [] : repairedV.issues });
      if (repairedV.ok) return { ok: true, data: repairedV.value as T, text: repairedRaw, attempts };
      raw = repairedRaw; v = repairedV; attempt++;
    }

    if (!v.ok && doFieldRetry) {
      const fields = normalizeFields(!v.ok ? v.issues : []);
      if (fields.length > 0) {
        if (parallelFieldRetry && fields.length > 1) {
          const tasks = fields.map(f => fieldRetry({ provider, model: currentModel, system, currentJson: parsed ?? {}, missingFields: [f], schemaHint: '[schema elided]' }));
          const results = await Promise.all(tasks);
          let merged = { ...(parsed ?? {}) };
          for (const r of results) { const ri = tryParse(r, strictJsonOnly); if (ri && typeof ri === 'object') merged = deepMerge(merged, ri as any); }
          const frV: ValidationResult<T> = genericValidate<T>({ validator, schema, data: merged, ajvInstance });
          attempts.push({ model: currentModel, step: 'field', raw: JSON.stringify(merged), parsed: merged, valid: frV.ok, issues: frV.ok ? [] : frV.issues });
          if (frV.ok) return { ok: true, data: frV.value as T, text: JSON.stringify(merged), attempts };
          errors.push({ code: 'FIELD_RETRY_FAILED', message: (frV.ok ? '' : (frV as any).issues ?? []).toString() });
        } else {
          const fr = await fieldRetry({ provider, model: currentModel, system, currentJson: parsed ?? {}, missingFields: fields, schemaHint: '[schema elided]' });
          const frRaw = fr;
          const frParsed = tryParse(frRaw, strictJsonOnly);
          const frV: ValidationResult<T> = genericValidate<T>({ validator, schema, data: frParsed ?? {}, ajvInstance });
          attempts.push({ model: currentModel, step: 'field', raw: frRaw, parsed: frParsed ?? undefined, valid: frV.ok, issues: frV.ok ? [] : frV.issues });
          if (frV.ok) return { ok: true, data: frV.value as T, text: frRaw, attempts };
          errors.push({ code: 'FIELD_RETRY_FAILED', message: (frV.ok ? '' : (frV as any).issues ?? []).toString() });
        }
      }
    }
    errors.push({ code: 'MODEL_FAILED', message: `Model ${currentModel} did not produce valid output after repair.` });
  }
  return { ok: false, attempts, errors };
}

function tryParse(text:string, strictJsonOnly:boolean): any | null {
  const s1 = stripCodeFences(text).trim();
  const direct = safeJsonParse(s1);
  if (direct.ok) return direct.value;
  if (!strictJsonOnly) return null;
  const extracted = extractFirstJsonBlock(text);
  if (!extracted) return null;
  const p = safeJsonParse(extracted);
  return p.ok ? p.value : null;
}
function normalizeFields(issues:string[]): string[] { const set = new Set<string>(); for(const x of issues){ const m = x.match(/^([.\w\[\]"]+):/); if(m) set.add(m[1]); } return [...set]; }
export class StructuredRunner { async run<T>(opts:StructuredRunnerOptions<T>){ return runWithSchema<T>(opts); } }
