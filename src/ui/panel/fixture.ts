/**
 * Un estado chico y armado a mano para los tests del panel. Hoy es el 17 de
 * noviembre de 2026 y todas las tarifas son de $ 300 por mes, $ 10 por día.
 *
 * - A, CO2 7 kg: entregado el 01/09, cobra desde el 01/11 (77 días).
 * - B, CO2 7 kg: entregado el 20/09, cobra desde el 20/11 (58 días, por vencer).
 * - C, acetileno 4 kg: en stock.
 * - E, acetileno 4 kg: estuvo del 01/07 al 15/10; cobró del 31/08 al 15/10.
 * - D, acetileno 4 kg: dado de baja.
 */

import type { FechaISO } from '../../dominio/arriendo';
import type { AvisoRegistrado, Cilindro, EstadoApp, Movimiento } from '../../dominio/tipos';

export const HOY: FechaISO = '2026-11-17';

function cilindro(id: string, tipoGas: string, kg: number, activo = true): Cilindro {
  return { id, serie: id, tipoGas, kg, tarifaMensual: 300, activo };
}

function movimiento(
  id: string,
  tipo: Movimiento['tipo'],
  fecha: FechaISO,
  extra: Partial<Movimiento> = {},
): Movimiento {
  return { id, tipo, cilindroId: 'C', clienteId: 'cli', fecha, loteId: `lote-${id}`, operador: 'Ana', ...extra };
}

function aviso(id: string, canal: AvisoRegistrado['canal'], creadoEn: string): AvisoRegistrado {
  return {
    id,
    arriendoId: 'arr-A',
    cilindroId: 'A',
    clienteId: 'cli',
    dias: 70,
    canal,
    etapa: 'con_cargo',
    destino: canal === 'mail' ? 'x@ejemplo.com' : null,
    operador: canal === 'mail' ? 'Automático' : 'Ana',
    creadoEn,
  };
}

export function estadoDePrueba(): EstadoApp {
  return {
    version: 1,
    operador: 'Ana',
    clientes: [{ id: 'cli', nombre: 'Taller', tipo: 'empresa', documento: '1', telefono: '+59899000000' }],
    cilindros: [
      cilindro('A', 'CO2', 7),
      cilindro('B', 'CO2', 7),
      cilindro('C', 'Acetileno', 4),
      cilindro('E', 'Acetileno', 4),
      cilindro('D', 'Acetileno', 4, false),
    ],
    arriendos: [
      { id: 'arr-A', cilindroId: 'A', clienteId: 'cli', fechaEntrega: '2026-09-01', fechaDevolucion: null },
      { id: 'arr-B', cilindroId: 'B', clienteId: 'cli', fechaEntrega: '2026-09-20', fechaDevolucion: null },
      { id: 'arr-E', cilindroId: 'E', clienteId: 'cli', fechaEntrega: '2026-07-01', fechaDevolucion: '2026-10-15' },
    ],
    movimientos: [
      movimiento('m1', 'entrega', '2026-11-03'),
      movimiento('m2', 'devolucion', '2026-11-10'),
      movimiento('m3', 'entrega', '2026-11-30'),
      // Deshecho: no cuenta.
      movimiento('m4', 'entrega', '2026-11-05', { deshecho: { operador: 'Ana', creadoEn: '2026-11-05T13:00:00Z' } }),
      // De octubre: no cuenta en noviembre.
      movimiento('m5', 'entrega', '2026-10-31'),
    ],
    avisos: [
      // 23:30 del 30/11 en Montevideo, aunque en UTC ya sea diciembre: es de noviembre.
      aviso('a1', 'whatsapp', '2026-12-01T02:30:00Z'),
      // 23:00 del 31/10 en Montevideo: es de octubre.
      aviso('a2', 'mail', '2026-11-01T02:00:00Z'),
      aviso('a3', 'mail', '2026-11-12T12:00:00Z'),
    ],
  };
}

/** El mismo estado, como lo ve alguien que no puede ver tarifas. */
export function estadoSinTarifas(): EstadoApp {
  const estado = estadoDePrueba();
  return { ...estado, cilindros: estado.cilindros.map((c) => ({ ...c, tarifaMensual: null })) };
}
