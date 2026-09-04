/**
 * Declaraciones de ambiente (ambient) para los globales del runtime.
 *
 * Tipan los objetos globales que provee el entorno de ejecución (Deno /
 * Supabase Edge Functions) para que el código compile sin depender de los tipos
 * completos del runtime. No aportan implementación: solo describen la forma de
 * lo que ya existe en tiempo de ejecución.
 *
 * @module runtime
 */

/**
 * Global de Deno disponible en el runtime.
 *
 * @remarks
 * - `env.get(key)` lee una variable de entorno (o `undefined` si no existe).
 * - `serve(handler)` registra el manejador HTTP de la función.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

/**
 * Global de Supabase Edge Runtime, si está disponible.
 *
 * @remarks
 * `waitUntil(p)` prolonga la vida de la invocación hasta que la promesa `p`
 * termine, útil para trabajo en segundo plano (p. ej. la auto-invocación de
 * chunks). Puede ser `undefined` en entornos donde no exista; por eso se
 * comprueba antes de usarlo.
 */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;