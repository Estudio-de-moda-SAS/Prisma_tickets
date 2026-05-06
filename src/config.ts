export const config = {
  // ── Modo de datos ────────────────────────────────────────────
  // true  → usa mock data local (desarrollo sin backend)
  // false → usa Supabase
  USE_MOCK: false,

  // ── Auth ─────────────────────────────────────────────────────
  // true  → salta el login de Azure AD (solo desarrollo UI)
  BYPASS_AUTH: false,

  // ── Bypass de rol (solo desarrollo) ──────────────────────────
  // null       → comportamiento real: rol resuelto desde el token de Azure AD
  // 'admin'    → ve todo
  // 'member'   → home + stats + board de BYPASS_TEAM
  // 'client'   → solo home
  BYPASS_ROLE: 'admin' as 'admin' | 'member' | 'client' | null,

  // Equipo activo cuando BYPASS_ROLE === 'member'
  BYPASS_TEAM: 'desarrollo' as 'desarrollo' | 'crm' | 'sistemas' | 'analisis',

  // ── Board por defecto ────────────────────────────────────────
  // Board_ID en Supabase que usa la app al inicializar
  DEFAULT_BOARD_ID: 1,
} as const;