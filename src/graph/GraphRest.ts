export type GraphRecipient = {
  emailAddress: {
    address: string;
  };
};

export type GraphSendMailPayload = {
  message: {
    subject: string;
    body: {
      contentType: 'Text' | 'HTML';
      content: string;
    };
    toRecipients: GraphRecipient[];
    ccRecipients?: GraphRecipient[];
  };
  saveToSentItems?: boolean;
};

export class GraphRest {
  private getToken: () => Promise<string>;
  private base = 'https://graph.microsoft.com/v1.0';

  constructor(getToken: () => Promise<string>, baseUrl?: string) {
    this.getToken = getToken;
    if (baseUrl) this.base = baseUrl;
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const token = await this.getToken();
    const hasBody = body !== undefined && body !== null;

    const res = await fetch(this.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
        ...(init?.headers ?? {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
      ...init,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const txt = await res.text();
        if (txt) {
          try {
            const j = JSON.parse(txt);
            detail = j?.error?.message ?? j?.message ?? txt;
          } catch {
            detail = txt;
          }
        }
      } catch { /* ignore */ }
      throw new Error(
        `${method} ${path} → ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`,
      );
    }

    if (res.status === 204) return undefined as unknown as T;

    const ct = res.headers.get('content-type') ?? '';
    const txt = await res.text();
    if (!txt) return undefined as unknown as T;

    return ct.includes('application/json')
      ? (JSON.parse(txt) as T)
      : (txt as unknown as T);
  }

  get<T = unknown>(path: string, init?: RequestInit) {
    return this.call<T>('GET', path, undefined, init);
  }

  post<T = unknown>(path: string, body: unknown, init?: RequestInit) {
    return this.call<T>('POST', path, body, init);
  }

  patch<T = unknown>(path: string, body: unknown, init?: RequestInit) {
    return this.call<T>('PATCH', path, body, init);
  }

  delete(path: string, init?: RequestInit) {
    return this.call<void>('DELETE', path, undefined, init);
  }

  async getAbsolute<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const txt = await res.text();
        if (txt) {
          try { detail = JSON.parse(txt)?.error?.message ?? txt; }
          catch { detail = txt; }
        }
      } catch { /* ignore */ }
      throw new Error(
        `GET (absolute) ${url} → ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`,
      );
    }

    if (res.status === 204) return undefined as unknown as T;

    const ct = res.headers.get('content-type') ?? '';
    const txt = await res.text();
    if (!txt) return undefined as unknown as T;

    return ct.includes('application/json')
      ? (JSON.parse(txt) as T)
      : (txt as unknown as T);
  }

  async getBlob(path: string): Promise<Blob> {
    const token = await this.getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Graph getBlob ${res.status}`);
    return res.blob();
  }

  async putBinary<T = unknown>(
    path: string,
    binary: Blob | ArrayBuffer | Uint8Array,
    contentType?: string,
    init?: RequestInit,
  ): Promise<T> {
    const token = await this.getToken();

    const res = await fetch(this.base + path, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(init?.headers ?? {}),
      },
      body: binary as BodyInit,
      ...init,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const txt = await res.text();
        if (txt) {
          try { detail = JSON.parse(txt)?.error?.message ?? txt; }
          catch { detail = txt; }
        }
      } catch { /* ignore */ }
      throw new Error(`PUT ${path} → ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
    }

    if (res.status === 204) return undefined as unknown as T;

    const ct = res.headers.get('content-type') ?? '';
    const txt = await res.text();
    if (!txt) return undefined as unknown as T;

    return ct.includes('application/json')
      ? (JSON.parse(txt) as T)
      : (txt as unknown as T);
  }
}
