declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;