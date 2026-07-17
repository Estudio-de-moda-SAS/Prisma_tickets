// src/lib/supabaseClient.ts
//
// Cliente supabase-js para autenticación nativa (Supabase Auth + Azure)
// y, más adelante, lecturas directas a PostgREST con RLS.
//
// Coexiste con MSAL durante la migración. Mientras USE_SUPABASE_AUTH
// esté en false, este cliente no interviene en el flujo de la app.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  // No tiramos throw para no romper el arranque mientras el flag esté apagado;
  // solo avisamos. Cuando actives USE_SUPABASE_AUTH, estas deben existir.
  console.warn(
    '[supabaseClient] Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY. ' +
    'El login de Supabase Auth no funcionará hasta que estén definidas.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:      true,   // guarda la sesión (localStorage) entre recargas
    autoRefreshToken:    true,    // renueva el JWT automáticamente
    detectSessionInUrl:  true,    // procesa el retorno del redirect de OAuth
  },
  
});
