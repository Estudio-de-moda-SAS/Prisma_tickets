export const config = {
  USE_MOCK: true,
  BYPASS_AUTH: true,
  // ── Azure AD Group GUIDs ────────────────────────────────────────────────────
  // Reemplaza cada string vacío con el Object ID del grupo en Azure AD.
  // Portal: Azure Active Directory → Groups → selecciona el grupo → Object ID
  //
  // Nombres de grupos en Azure AD:
  //   desarrolloandux-ejecutor
  //   crm-ejecutor
  //   sistemasinfo-ejecutor
  //   analisisdatos-ejecutor
  //   admin
  GROUPS: {
    desarrollo: '',   // desarrolloandux-ejecutor  → Object ID
    crm:        '',   // crm-ejecutor              → Object ID
    sistemas:   '',   // sistemasinfo-ejecutor     → Object ID
    analisis:   '',   // analisisdatos-ejecutor    → Object ID
    admin:      '',   // admin                     → Object ID
  },

  // ── Bypass de rol (solo desarrollo) ─────────────────────────────────────────
  // null       → comportamiento real: rol resuelto desde el token de Azure AD
  // 'admin'    → ve todo
  // 'member'   → home + stats + board de BYPASS_TEAM
  // 'client'   → solo home
  BYPASS_ROLE: 'admin' as 'admin' | 'member' | 'client' | null,

  // Equipo activo cuando BYPASS_ROLE === 'member'
  BYPASS_TEAM: 'desarrollo' as 'desarrollo' | 'crm' | 'sistemas' | 'analisis',
} as const;