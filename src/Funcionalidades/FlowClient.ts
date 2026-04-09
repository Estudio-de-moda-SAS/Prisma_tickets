export type FlowInvokeOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
};

export class FlowClient {
  private readonly flowUrl: string; 

  constructor(flowUrl: string) {
    if (!flowUrl || !/^https?:\/\//i.test(flowUrl)) {
      throw new Error("FlowClient: URL inválida");
    }
    this.flowUrl = flowUrl; 
  }

  async invoke<TIn extends object, TOut = unknown>(
    payload: TIn,
    opts: FlowInvokeOptions = {}
  ): Promise<TOut> {
    const { headers = {}, timeoutMs = 30_000, retries = 0 } = opts;
    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    const tryOnce = async (): Promise<TOut> => {
      const ac = new AbortController();
      const id = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(this.flowUrl, {
          method: "POST",
          headers: mergedHeaders,
          body: JSON.stringify(payload),
          signal: ac.signal,
        });
        const ct = res.headers.get("content-type") || "";
        const isJson = ct.includes("application/json");
        const raw = await res.text().catch(() => "");
        if (!res.ok) {
          let msg = raw;
          if (isJson) {
            try {
              const obj = JSON.parse(raw);
              msg = (obj as any)?.error || (obj as any)?.message || JSON.stringify(obj);
            } catch {}
          }
          throw new Error(`Flow ${res.status}: ${msg || "Error invocando el flujo"}`);
        }
        return (isJson ? JSON.parse(raw) : ({} as any)) as TOut;
      } finally {
        clearTimeout(id);
      }
    };

    let attempt = 0;
    while (true) {
      try {
        return await tryOnce();
      } catch (err: any) {
        const transient =
          /abort/i.test(String(err?.message)) ||
          /timed out/i.test(String(err?.message)) ||
          /network/i.test(String(err?.message)) ||
          /Flow 5\d{2}/.test(String(err?.message));
        if (attempt >= retries || !transient) throw err;
        attempt++;
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
  }
}
