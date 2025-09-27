export interface Provider {
  chat(input: {
    model: string;
    system?: string;
    prompt: string;
    temperature?: number;
    jsonMode?: boolean;
    abortSignal?: AbortSignal;
  }): Promise<{ text: string }>;
}
