/* ============================================================================
   SUSHI POKE — Configuración de Supabase
   1. Crea tu proyecto en https://supabase.com
   2. Ve a Project Settings → API
   3. Pega la URL y la anon key abajo
   ⚠️ NUNCA subas la service_role key al frontend. La anon key es pública
      y está protegida por las políticas RLS del esquema.
   ============================================================================ */

   const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY = 'TU-ANON-KEY';
   
   if (SUPABASE_URL.includes('TU-PROYECTO')) {
     console.warn('[SushiPoke] Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en js/supabase-config.js');
   }
   
   window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     auth: {
       persistSession: true,
       autoRefreshToken: true,
       detectSessionInUrl: true   // necesario para el enlace de recuperación de clave
     }
   });