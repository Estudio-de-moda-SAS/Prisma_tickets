/**
 * Helpers para respuestas HTTP con cabeceras CORS.
 *
 * Provee las cabeceras CORS compartidas ({@link CORS_HEADERS}) y dos fábricas de
 * `Response` JSON: {@link corsResponse} para respuestas normales y
 * {@link errorResponse} para errores.
 *
 * @module cors
 */

/**
 * Cabeceras CORS aplicadas a todas las respuestas.
 *
 * @remarks
 * Permite cualquier origen (`*`) y los métodos y cabeceras usados por la API.
 * También sirven para responder al preflight `OPTIONS`.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/**
 * Construye una `Response` JSON con las cabeceras CORS y `Content-Type` adecuado.
 *
 * @param body - Valor a serializar como JSON en el cuerpo.
 * @param status - Código de estado HTTP (por defecto `200`).
 * @returns La `Response` lista para devolver desde el handler.
 */
export function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Construye una respuesta de error JSON con la forma `{ error: message }`.
 *
 * @param message - Mensaje de error a incluir en el cuerpo.
 * @param status - Código de estado HTTP del error.
 * @returns La `Response` de error con cabeceras CORS.
 */
export function errorResponse(message: string, status: number) {
  return corsResponse({ error: message }, status);
}