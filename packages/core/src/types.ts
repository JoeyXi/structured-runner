import type { ZodSchema } from 'zod';
import type Ajv from 'ajv';
import type { Provider } from './providers/types';
import type { ValidatorKind } from './strategies/validate';

export type StructuredRunnerOptions<TOut=any> = {
  provider: Provider;
  schema: ZodSchema<TOut> | object;
  validator?: ValidatorKind;
  ajvInstance?: Ajv;
  system?: string;
  user: string;
  input?: Record<string, any>;
  maxAttempts?: number;
  fieldRetry?: boolean;
  parallelFieldRetry?: boolean;
  model?: string;
  fallbackModels?: string[];
  temperature?: number;
  strictJsonOnly?: boolean;
  abortSignal?: AbortSignal;
};
export type RunnerError = { code:string; message:string };
export type AttemptLog = { model:string; step:'initial'|'repair'|'field'; raw:string; parsed?:any; valid:boolean; issues?:string[]; };
export type StructuredRunnerResult<T> = { ok:boolean; data?:T; text?:string; attempts:AttemptLog[]; errors?:RunnerError[]; };
