export const config = {
  // ── Modo de datos ────────────────────────────────────────────
  // true  → usa mock data local (desarrollo sin backend)
  // false → usa Supabase
  USE_MOCK: false,

  // ── Auth ─────────────────────────────────────────────────────
  // true  → salta el login de Azure AD (solo desarrollo UI)
  BYPASS_AUTH: false,

  // ── Board por defecto ────────────────────────────────────────
  // Board_ID en Supabase que usa la app al inicializar
  DEFAULT_BOARD_ID: 1,
} as const;