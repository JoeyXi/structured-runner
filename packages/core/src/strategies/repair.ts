import type { Provider } from '../providers/types';
export async function repairByRewrite(params:{ provider:Provider; model:string; system?:string; badOutput:string; schemaHint:string; temperature?:number;}):Promise<string>{
  const prompt=[`Your task: repair the following into **a single JSON object** that strictly matches the given schema.`,`Do not add any explanations. Output JSON only.`,`— Schema (brief):`,schemaBlock(params.schemaHint),`— To repair:`,fenced(params.badOutput)].join('\n\n');
  const { text } = await params.provider.chat({ model: params.model, system: params.system ?? 'You are a strict structured-output repairer. Return JSON only.', prompt, temperature: params.temperature ?? 0, jsonMode: true });
  return text.trim();
}
export async function fieldRetry(params:{ provider:Provider; model:string; system?:string; currentJson:any; missingFields:string[]; schemaHint:string;}):Promise<string>{
  const prompt=[`Existing JSON:`,fenced(JSON.stringify(params.currentJson,null,2)),`The following fields are missing/invalid: ${params.missingFields.join(', ')}`,`Please return a complete corrected JSON (match the schema). Keep other fields unchanged.`,schemaBlock(params.schemaHint)].join('\n\n');
  const { text } = await params.provider.chat({ model: params.model, system: params.system ?? 'You are a strict structured-output repairer. Return JSON only.', prompt, temperature: 0, jsonMode: true });
  return text.trim();
}
function schemaBlock(s:string){return '```json\n'+s+'\n```'}; function fenced(s:string){return '```json\n'+s+'\n```'};
