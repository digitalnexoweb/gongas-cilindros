/**
 * El filtro de la lista de Cilindros: estado, gas, peso y búsqueda por serie,
 * todo junto. Puro, para poder probarlo sin pantalla.
 */

import type { VistaCilindro } from '../../dominio/consultas';
import { estadoVisible, type EstadoVisible } from '../ChipEstado';

export type FiltroEstado = 'todos' | EstadoVisible | 'de_baja';

export type FiltroCilindros = {
  estado: FiltroEstado;
  /** `null`: cualquier gas. */
  gas: string | null;
  /** `null`: cualquier peso. */
  kg: number | null;
  /** Parte de la serie; vacío no filtra. */
  texto: string;
};

/** Con lo que se abre la lista cuando se llega desde el panel. */
export type FiltroInicial = Partial<Pick<FiltroCilindros, 'estado' | 'gas' | 'kg'>>;

export function filtrarCilindros(vistas: VistaCilindro[], filtro: FiltroCilindros): VistaCilindro[] {
  const texto = filtro.texto.trim().toLowerCase();

  return vistas.filter(({ cilindro, calculo }) => {
    // Los dados de baja no se mezclan con los demás: solo aparecen con su filtro.
    if (filtro.estado === 'de_baja') {
      if (cilindro.activo) return false;
    } else {
      if (!cilindro.activo) return false;
      if (filtro.estado !== 'todos' && estadoVisible(calculo) !== filtro.estado) return false;
    }

    if (filtro.gas !== null && cilindro.tipoGas.toLowerCase() !== filtro.gas.toLowerCase()) return false;
    if (filtro.kg !== null && cilindro.kg !== filtro.kg) return false;
    if (texto !== '' && !cilindro.serie.toLowerCase().includes(texto)) return false;
    return true;
  });
}

/** Los gases y los pesos que tienen los cilindros, para ofrecer en los filtros. */
export function opcionesDeFiltro(vistas: VistaCilindro[]): { gases: string[]; pesos: number[] } {
  const gases = [...new Set(vistas.map((v) => v.cilindro.tipoGas))].sort((a, b) => a.localeCompare(b, 'es'));
  const pesos = [...new Set(vistas.map((v) => v.cilindro.kg))].sort((a, b) => a - b);
  return { gases, pesos };
}
