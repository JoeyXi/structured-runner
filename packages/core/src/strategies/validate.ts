import { ZodSchema, ZodError } from 'zod';
import Ajv, { ErrorObject } from 'ajv';
export type ValidatorKind='zod'|'ajv';
export function validateWithZod<T>(schema:ZodSchema<T>, data:unknown){
  try{ const value=schema.parse(data); return {ok:true as const, value}; }
  catch(e:any){ if(e instanceof ZodError){ return {ok:false as const, issues:e.issues.map(i=>`${i.path.join('.')||'(root)'}: ${i.message}`)} }
  return {ok:false as const, issues:[String(e)]}; }
}
export function validateWithAjv<T>(schema:object, data:unknown, ajv?:Ajv){
  const ajvI=ajv ?? new Ajv({allErrors:true,strict:false});
  const validate=ajvI.compile<T>(schema as any);
  const ok=validate(data);
  if(ok) return {ok:true as const, value:data as T};
  const issues=(validate.errors??[]).map(formatAjvError);
  return {ok:false as const, issues};
}
function formatAjvError(err:ErrorObject){ const path=err.instancePath?err.instancePath.replace(/\//g,'.').replace(/^\./,''):'(root)'; return `${path}: ${err.message??'invalid'}`; }
export function genericValidate<T>(opts:{validator:ValidatorKind; schema:any; data:unknown; ajvInstance?:Ajv}){ if(opts.validator==='zod') return validateWithZod<T>(opts.schema as ZodSchema<T>, opts.data); return validateWithAjv<T>(opts.schema as object, opts.ajvInstance ? opts.data : opts.data, opts.ajvInstance); }
