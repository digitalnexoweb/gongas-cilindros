import { defineConfig } from 'vitest/config';

// La sección 5 del SPEC exige que los tests corran en America/Montevideo (UTC−3),
// para probar que ninguna fecha se corre un día hacia atrás al oeste de Greenwich.
// Se fija por los dos lados: acá, antes de que arranque el runner, y en test.env,
// para los workers. El primer test de arriendo.test.ts verifica que agarró.
process.env.TZ = 'America/Montevideo';

export default defineConfig({
  test: {
    env: { TZ: 'America/Montevideo' },
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
  },
});
