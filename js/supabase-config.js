/* ============================================================================
   SUSHI POKE — Configuración de Supabase
   1. Crea tu proyecto en https://supabase.com
   2. Ve a Project Settings → API
   3. Pega la URL y la anon key abajo
   ⚠️ NUNCA subas la service_role key al frontend. La anon key es pública
      y está protegida por las políticas RLS del esquema.
   ============================================================================ */

   const SUPABASE_URL = 'https://asymyfcydabuyukujegi.supabase.co/rest/v1/';
   const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeW15ZmN5ZGFidXl1a3VqZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzODYyODAsImV4cCI6MjEwNjk2MjI4MH0.zxkn4Etk-LTWaTFV8q-DV_HxUrlRvq57yYvWnztqpQ4';
   
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