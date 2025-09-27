export function deepMerge<T extends Record<string, any>>(base:T, patch:Partial<T>):T{
  for(const k of Object.keys(patch)){
    const pv:any=(patch as any)[k];
    if(pv && typeof pv==='object' && !Array.isArray(pv) && typeof (base as any)[k]==='object' && (base as any)[k]!==null && !Array.isArray((base as any)[k])){
      (base as any)[k]=deepMerge({...(base as any)[k]}, pv);
    }else if(pv!==undefined){
      (base as any)[k]=pv;
    }
  }
  return base;
}
