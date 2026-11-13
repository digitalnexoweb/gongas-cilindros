import { describe, expect, it } from 'vitest';

import { DIAS_POR_VENCER, formatearPesos, sumarDias, type FechaISO } from './arriendo';
import {
  arriendosDe,
  cilindroPorSerie,
  estaEnStock,
  historialDe,
  ubicacionDe,
  vistaAvisos,
  vistaCilindros,
  vistaClientes,
  type VistaCilindro,
} from './consultas';
import { confirmarLote, estadoDemo } from './storage';
import type { Cilindro, EstadoApp } from './tipos';

const HOY: FechaISO = '2026-11-05';

function cilindro(estado: EstadoApp, serie: string): Cilindro {
  const encontrado = cilindroPorSerie(estado, serie);
  if (encontrado === null) throw new Error(`No existe el cilindro ${serie}.`);
  return encontrado;
}

function vista(estado: EstadoApp, serie: string): VistaCilindro {
  const encontrada = vistaCilindros(estado, HOY).find((v) => v.cilindro.serie === serie);
  if (encontrada === undefined) throw new Error(`No hay vista de ${serie}.`);
  return encontrada;
}

// ─────────────────── La regla de la sección 4: la ubicación se deduce

describe('la ubicacion se deduce, no se guarda', () => {
  it('el modelo no tiene ningun campo de ubicacion ni de estado', () => {
    // Si alguien agrega un campo acá, este test lo frena: es la regla que la
    // seccion 4 dice que no se negocia.
    expect(Object.keys(cilindro(estadoDemo(HOY), 'CIL-00101')).sort()).toEqual([
      'activo',
      'id',
      'kg',
      'serie',
      'tarifaMensual',
      'tipoGas',
    ]);
  });

  it('deduce que un cilindro con arriendo abierto esta en ese cliente', () => {
    const estado = estadoDemo(HOY);
    const ubicacion = ubicacionDe(estado, cilindro(estado, 'CIL-00101').id);

    expect(ubicacion.lugar).toBe('cliente');
    expect(ubicacion.lugar === 'cliente' && ubicacion.cliente.nombre).toBe('ANCAP');
  });

  it('deduce que un cilindro sin arriendo abierto esta en stock', () => {
    const estado = estadoDemo(HOY);
    expect(ubicacionDe(estado, cilindro(estado, 'CIL-00105').id)).toEqual({ lugar: 'stock' });
  });

  it('CIL-00107 figura en stock aunque tenga historial y un arriendo cerrado', () => {
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00107');

    expect(estaEnStock(estado, cil.id)).toBe(true);
    expect(arriendosDe(estado, cil.id)).toHaveLength(1);
    expect(historialDe(estado, cil.id)).toHaveLength(2);
    expect(vista(estado, 'CIL-00107').calculo).toBeNull();
  });

  it('la ubicacion cambia sola al confirmar un lote, sin escribir ningun campo', () => {
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00105');

    const entregado = confirmarLote(estado, {
      tipo: 'entrega',
      series: ['CIL-00105'],
      clienteId: 'cli-pereira',
      operador: 'Joaquín',
      fecha: HOY,
    }).estado;

    const devuelto = confirmarLote(entregado, {
      tipo: 'devolucion',
      series: ['CIL-00105'],
      clienteId: null,
      operador: 'Joaquín',
      fecha: HOY,
    }).estado;

    expect(ubicacionDe(estado, cil.id)).toEqual({ lugar: 'stock' });
    expect(ubicacionDe(entregado, cil.id).lugar).toBe('cliente');
    expect(ubicacionDe(devuelto, cil.id)).toEqual({ lugar: 'stock' });
  });
});

// ─────────────────── El historial

describe('el historial', () => {
  it('sale del movimiento mas nuevo al mas viejo', () => {
    const estado = estadoDemo(HOY);
    const historial = historialDe(estado, cilindro(estado, 'CIL-00107').id);

    expect(historial.map((m) => m.tipo)).toEqual(['devolucion', 'entrega']);
  });

  it('solo trae los movimientos de ese cilindro', () => {
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00101');

    expect(historialDe(estado, cil.id).every((m) => m.cilindroId === cil.id)).toBe(true);
  });

  it('pone primero el movimiento mas reciente cuando comparten fecha', () => {
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00105');

    const entregado = confirmarLote(estado, {
      tipo: 'entrega',
      series: ['CIL-00105'],
      clienteId: 'cli-ancap',
      operador: 'Joaquín',
      fecha: HOY,
    }).estado;
    const devuelto = confirmarLote(entregado, {
      tipo: 'devolucion',
      series: ['CIL-00105'],
      clienteId: null,
      operador: 'Joaquín',
      fecha: HOY,
    }).estado;

    expect(historialDe(devuelto, cil.id).map((m) => m.tipo)).toEqual(['devolucion', 'entrega']);
  });
});

// ─────────────────── Los criterios de aceptación de la sección 9

describe('la demo cumple los criterios de la seccion 9', () => {
  it('9.3: CIL-00101 figura en ANCAP con 92 dias y $ 469', () => {
    const v = vista(estadoDemo(HOY), 'CIL-00101');

    expect(v.calculo?.dias).toBe(92);
    expect(v.calculo?.importe).toBe(469);
    expect(formatearPesos(v.calculo?.importe ?? 0)).toBe('$ 469');
    expect(v.calculo?.estado).toBe('generando_cargo');
    expect(v.ubicacion.lugar === 'cliente' && v.ubicacion.cliente.nombre).toBe('ANCAP');
  });

  it('9.4: CIL-00103 figura en ambar, por vencer', () => {
    const v = vista(estadoDemo(HOY), 'CIL-00103');

    expect(v.calculo?.dias).toBe(58);
    expect(v.calculo?.estado).toBe('por_vencer');
    expect(v.calculo?.importe).toBe(0);
  });

  it('9.5: los avisos listan CIL-00101, CIL-00102 y CIL-00103, en ese orden', () => {
    const avisos = vistaCilindros(estadoDemo(HOY), HOY)
      .filter((v) => (v.calculo?.dias ?? 0) >= DIAS_POR_VENCER)
      .sort((a, b) => (b.calculo?.dias ?? 0) - (a.calculo?.dias ?? 0));

    expect(avisos.map((v) => v.cilindro.serie)).toEqual([
      'CIL-00101',
      'CIL-00102',
      'CIL-00103',
    ]);
    expect(avisos.map((v) => v.calculo?.dias)).toEqual([92, 75, 58]);
  });

  it('ANCAP acumula $ 689 entre sus dos cilindros', () => {
    const total = vistaCilindros(estadoDemo(HOY), HOY).reduce((suma, v) => {
      if (v.ubicacion.lugar !== 'cliente') return suma;
      if (v.ubicacion.cliente.id !== 'cli-ancap') return suma;
      return suma + (v.calculo?.importe ?? 0);
    }, 0);

    expect(total).toBe(689);
    expect(formatearPesos(total)).toBe('$ 689');
  });

  it('los 3 cilindros en stock no acumulan nada', () => {
    const enStock = vistaCilindros(estadoDemo(HOY), HOY).filter(
      (v) => v.ubicacion.lugar === 'stock',
    );

    expect(enStock.map((v) => v.cilindro.serie)).toEqual([
      'CIL-00105',
      'CIL-00106',
      'CIL-00107',
    ]);
    expect(enStock.every((v) => v.calculo === null && v.arriendo === null)).toBe(true);
  });

  it('la demo tiene algo que mostrar en avisos, un caso al borde y stock para escanear', () => {
    const vistas = vistaCilindros(estadoDemo(HOY), HOY);

    expect(vistas.filter((v) => v.calculo?.estado === 'generando_cargo')).toHaveLength(2);
    expect(vistas.filter((v) => v.calculo?.estado === 'por_vencer')).toHaveLength(1);
    expect(vistas.filter((v) => v.ubicacion.lugar === 'stock')).toHaveLength(3);
  });

  it('sigue cumpliendo los criterios dentro de un anio, porque las fechas no son fijas', () => {
    const hoy = '2027-11-05';
    const v = vistaCilindros(estadoDemo(hoy), hoy).find(
      (x) => x.cilindro.serie === 'CIL-00101',
    );

    expect(v?.calculo?.dias).toBe(92);
    expect(v?.calculo?.importe).toBe(469);
  });
});

// ─────────────────── La pantalla de avisos de la sección 6.4

describe('vistaAvisos', () => {
  it('9.5: lista CIL-00101, CIL-00102 y CIL-00103, del mas atrasado al menos', () => {
    const avisos = vistaAvisos(estadoDemo(HOY), HOY);

    expect(avisos.map((v) => v.cilindro.serie)).toEqual([
      'CIL-00101',
      'CIL-00102',
      'CIL-00103',
    ]);
    expect(avisos.map((v) => v.calculo?.dias)).toEqual([92, 75, 58]);
  });

  it('deja afuera a los que no llegaron a 54 dias', () => {
    const series = vistaAvisos(estadoDemo(HOY), HOY).map((v) => v.cilindro.serie);

    expect(series).not.toContain('CIL-00104'); // 20 días
    expect(series).not.toContain('CIL-00105'); // en stock
  });

  it('toma desde los 54 justos y deja afuera a los 53', () => {
    const estado = estadoDemo(HOY);

    const con54 = { ...estado, arriendos: [{ ...estado.arriendos[0]!, fechaEntrega: sumarDias(HOY, -54) }] };
    const con53 = { ...estado, arriendos: [{ ...estado.arriendos[0]!, fechaEntrega: sumarDias(HOY, -53) }] };

    expect(vistaAvisos(con54, HOY)).toHaveLength(1);
    expect(vistaAvisos(con53, HOY)).toHaveLength(0);
  });

  it('trae el cliente y el importe de cada fila, que es lo que muestra 6.4', () => {
    const primero = vistaAvisos(estadoDemo(HOY), HOY)[0];

    expect(primero?.ubicacion.lugar === 'cliente' && primero.ubicacion.cliente.nombre).toBe(
      'ANCAP',
    );
    expect(primero?.calculo?.importe).toBe(469);
  });
});

// ─────────────────── La fila por cliente de la sección 6.3

describe('vistaClientes', () => {
  function cliente(estado: EstadoApp, nombre: string) {
    const encontrado = vistaClientes(estado, HOY).find((v) => v.cliente.nombre === nombre);
    if (encontrado === undefined) throw new Error(`No hay vista de ${nombre}.`);
    return encontrado;
  }

  it('trae una fila por cliente, en el orden del estado', () => {
    expect(vistaClientes(estadoDemo(HOY), HOY).map((v) => v.cliente.nombre)).toEqual([
      'ANCAP',
      'Armada Nacional',
      'Taller Pereira',
    ]);
  });

  it('ANCAP tiene 2 cilindros y acumula $ 689', () => {
    const ancap = cliente(estadoDemo(HOY), 'ANCAP');

    expect(ancap.cilindros.map((v) => v.cilindro.serie)).toEqual(['CIL-00101', 'CIL-00102']);
    expect(ancap.total).toBe(689);
  });

  it('el total de cada cliente es la suma de sus cilindros', () => {
    for (const v of vistaClientes(estadoDemo(HOY), HOY)) {
      const suma = v.cilindros.reduce((s, c) => s + (c.calculo?.importe ?? 0), 0);
      expect(v.total).toBe(suma);
    }
  });

  it('un cliente sin cargos tiene cilindros pero total 0', () => {
    const armada = cliente(estadoDemo(HOY), 'Armada Nacional');

    expect(armada.cilindros).toHaveLength(1);
    expect(armada.total).toBe(0);
  });

  it('no cuenta los cilindros devueltos', () => {
    // Taller Pereira tiene CIL-00104 abierto y CIL-00107 ya devuelto.
    const pereira = cliente(estadoDemo(HOY), 'Taller Pereira');

    expect(pereira.cilindros.map((v) => v.cilindro.serie)).toEqual(['CIL-00104']);
    expect(pereira.total).toBe(0);
  });

  it('la suma de todos los clientes son los $ 689 del estado', () => {
    const totales = vistaClientes(estadoDemo(HOY), HOY).map((v) => v.total);

    expect(totales).not.toContain(null);
    expect(totales.reduce<number>((s, t) => s + (t ?? 0), 0)).toBe(689);
  });

  it('un cliente nuevo arranca sin cilindros y en 0', () => {
    const estado = estadoDemo(HOY);
    const sinNada = {
      ...estado,
      clientes: [
        ...estado.clientes,
        {
          id: 'cli-nuevo',
          nombre: 'Gasería del Este',
          tipo: 'empresa' as const,
          documento: '217000000011',
          telefono: '+59899100104',
        },
      ],
    };

    const nuevo = cliente(sinNada, 'Gasería del Este');
    expect(nuevo.cilindros).toEqual([]);
    expect(nuevo.total).toBe(0);
  });
});

// ─────────────────── Cuando quien mira no puede ver las tarifas

describe('sin tarifas: lo que ve un empleado', () => {
  /** La demo tal como la recibe un empleado: la base no le entrega tarifas. */
  function demoSinTarifas(): EstadoApp {
    const estado = estadoDemo(HOY);
    return { ...estado, cilindros: estado.cilindros.map((c) => ({ ...c, tarifaMensual: null })) };
  }

  it('el reloj da exactamente igual que con tarifas', () => {
    const con = vistaCilindros(estadoDemo(HOY), HOY);
    const sin = vistaCilindros(demoSinTarifas(), HOY);

    const reloj = (v: VistaCilindro) =>
      v.calculo === null
        ? null
        : {
            dias: v.calculo.dias,
            diasFacturables: v.calculo.diasFacturables,
            estado: v.calculo.estado,
            abierto: v.calculo.abierto,
          };

    expect(sin.map(reloj)).toEqual(con.map(reloj));
  });

  it('el importe es null, nunca cero', () => {
    // CIL-00101 lleva 92 días: con tarifa son $ 469. Sin tarifa no es "$ 0".
    const v = vistaCilindros(demoSinTarifas(), HOY).find((x) => x.cilindro.serie === 'CIL-00101');

    expect(v?.calculo?.dias).toBe(92);
    expect(v?.calculo?.estado).toBe('generando_cargo');
    expect(v?.calculo?.importe).toBeNull();
    expect(v?.calculo?.tarifaDiaria).toBeNull();
  });

  it('los avisos salen igual, en el mismo orden: no dependen de la plata', () => {
    expect(vistaAvisos(demoSinTarifas(), HOY).map((v) => v.cilindro.serie)).toEqual([
      'CIL-00101',
      'CIL-00102',
      'CIL-00103',
    ]);
  });

  it('el total de un cliente con cilindros es null', () => {
    const ancap = vistaClientes(demoSinTarifas(), HOY).find((v) => v.cliente.nombre === 'ANCAP');

    expect(ancap?.cilindros).toHaveLength(2);
    expect(ancap?.total).toBeNull();
  });

  it('alcanza con que falte una tarifa para que el total sea null, no un total a medias', () => {
    const estado = estadoDemo(HOY);
    const unaMenos: EstadoApp = {
      ...estado,
      cilindros: estado.cilindros.map((c) =>
        c.serie === 'CIL-00102' ? { ...c, tarifaMensual: null } : c,
      ),
    };

    const ancap = vistaClientes(unaMenos, HOY).find((v) => v.cliente.nombre === 'ANCAP');
    // Con las dos tarifas son $ 689; mostrar los $ 469 del que sí se ve sería mentir.
    expect(ancap?.total).toBeNull();
  });

  it('un cliente sin cilindros sigue en 0: ahí no falta ninguna tarifa', () => {
    const estado = demoSinTarifas();
    const sinNada: EstadoApp = {
      ...estado,
      clientes: [
        ...estado.clientes,
        { id: 'cli-nuevo', nombre: 'Gasería del Este', tipo: 'empresa', documento: '', telefono: '' },
      ],
    };

    const nuevo = vistaClientes(sinNada, HOY).find((v) => v.cliente.nombre === 'Gasería del Este');
    expect(nuevo?.total).toBe(0);
  });
});
