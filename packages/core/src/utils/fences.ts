export function stripCodeFences(s:string){return s.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi,'$1').trim();}
