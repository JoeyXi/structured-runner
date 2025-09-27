import type { Provider } from './types';
export class OpenAIProvider implements Provider {
  constructor(private cfg: { apiKey: string; baseURL?: string; headers?: Record<string,string> }) {}
  async chat(input: { model: string; system?: string; prompt: string; temperature?: number; jsonMode?: boolean; abortSignal?: AbortSignal; }): Promise<{ text: string }> {
    const url = (this.cfg.baseURL ?? 'https://api.openai.com/v1') + '/chat/completions';
    const headers: Record<string,string> = { 'Content-Type':'application/json', Authorization:`Bearer ${this.cfg.apiKey}`, ...(this.cfg.headers ?? {}) };
    const body: any = { model: input.model, temperature: input.temperature ?? 0, messages: [ ...(input.system ? [{ role:'system', content: input.system }] : []), { role:'user', content: input.prompt } ] };
    if (input.jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body), signal: input.abortSignal as any });
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { text };
  }
}
