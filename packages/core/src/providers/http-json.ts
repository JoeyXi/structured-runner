import type { Provider } from './types';
export class HttpJSONProvider implements Provider {
  constructor(private cfg: { endpoint: string; headers?: Record<string,string> }) {}
  async chat(input: { model: string; system?: string; prompt: string; temperature?: number; jsonMode?: boolean; abortSignal?: AbortSignal; }): Promise<{ text: string }> {
    const combined = input.system ? `${input.system}\n\n${input.prompt}` : input.prompt;
    const res = await fetch(this.cfg.endpoint, { method:'POST', headers: { 'Content-Type':'application/json', ...(this.cfg.headers ?? {}) }, body: JSON.stringify({ prompt: combined }), signal: input.abortSignal as any });
    if (!res.ok) throw new Error(`HttpJSONProvider HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { text: String(data.output ?? '') };
  }
}
