import { createClient } from '@supabase/supabase-js';

/**
 * El cliente de Supabase. Es lo único del proyecto que sabe la dirección de la
 * base, y solo lo importa `repositorio.ts`.
 *
 * La clave es la pública: está hecha para ir en el navegador. Lo que cada
 * usuario puede ver y hacer lo deciden las reglas por fila de la base
 * (supabase/migrations/0002_permisos.sql), no el hecho de tener esta clave.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !clave) {
  throw new Error(
    'Falta la conexión con Supabase. Copiá .env.example como .env.local y completá los dos valores.',
  );
}

export const supabase = createClient(url, clave);
