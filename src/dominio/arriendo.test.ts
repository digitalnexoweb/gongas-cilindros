import { describe, expect, it } from 'vitest';

import {
  DIAS_GRACIA,
  DIAS_POR_VENCER,
  aFechaISO,
  calcularArriendo,
  diasEntre,
  diasFacturables,
  diasTranscurridos,
  estadoArriendo,
  formatearFecha,
  formatearPesos,
  hoyISO,
  importeArriendo,
  parseFechaISO,
  sumarDias,
  tarifaDiaria,
  type FechaISO,
} from './arriendo';

/** La fecha de "hoy" de la tabla de la sección 5 del SPEC. */
const HOY: FechaISO = '2026-11-05';

const TARIFA_CHICO = 380;
const TARIFA_GRANDE = 440;

// ─────────────────────────────────── La tabla de casos de la sección 5

type CasoDelSpec = {
  caso: string;
  entrega: FechaISO;
  devolucion: FechaISO | null;
  tarifa: number;
  dias: number;
  facturables: number;
  importe: number;
};

const casosDelSpec: CasoDelSpec[] = [
  { caso: 'Dentro de la gracia',      entrega: '2026-10-20', devolucion: null,         tarifa: TARIFA_CHICO,  dias: 16, facturables: 0,  importe: 0 },
  { caso: 'Justo en el limite',       entrega: '2026-09-06', devolucion: null,         tarifa: TARIFA_CHICO,  dias: 60, facturables: 0,  importe: 0 },
  { caso: 'Primer dia con cargo',     entrega: '2026-09-05', devolucion: null,         tarifa: TARIFA_CHICO,  dias: 61, facturables: 1,  importe: 13 },
  { caso: 'Cilindro chico atrasado',  entrega: '2026-08-05', devolucion: null,         tarifa: TARIFA_CHICO,  dias: 92, facturables: 32, importe: 405 },
  { caso: 'Cilindro grande atrasado', entrega: '2026-08-22', devolucion: null,         tarifa: TARIFA_GRANDE, dias: 75, facturables: 15, importe: 220 },
  { caso: 'Devuelto, reloj detenido', entrega: '2026-07-01', devolucion: '2026-10-01', tarifa: TARIFA_GRANDE, dias: 92, facturables: 32, importe: 469 },
];

describe('tabla de casos de la seccion 5 del SPEC', () => {
  it.each(casosDelSpec)(
    '$caso: $dias dias, $facturables facturables, importe $importe',
    ({ entrega, devolucion, tarifa, dias, facturables, importe }) => {
      const resultado = calcularArriendo(
        { fechaEntrega: entrega, fechaDevolucion: devolucion },
        tarifa,
        HOY,
      );

      expect(resultado.dias).toBe(dias);
      expect(resultado.diasFacturables).toBe(facturables);
      expect(resultado.importe).toBe(importe);
    },
  );
});

// ─────────────────────────────────────────── Los 60 días de gracia

describe('la gracia de 60 dias', () => {
  it('no cobra nada hasta el dia 60 inclusive', () => {
    expect(diasFacturables(0)).toBe(0);
    expect(diasFacturables(59)).toBe(0);
    expect(diasFacturables(DIAS_GRACIA)).toBe(0);
  });

  it('cobra el primer dia a los 61', () => {
    expect(diasFacturables(61)).toBe(1);
    expect(diasFacturables(62)).toBe(2);
  });

  it('el dia 60 no genera importe y el 61 si', () => {
    expect(importeArriendo(60, TARIFA_CHICO)).toBe(0);
    expect(importeArriendo(61, TARIFA_CHICO)).toBe(13);
  });
});

// ──────────────────────────────────────────────── Estados y colores

describe('estados del arriendo', () => {
  it('esta en gracia hasta los 53 dias', () => {
    expect(estadoArriendo(0)).toBe('en_gracia');
    expect(estadoArriendo(53)).toBe('en_gracia');
  });

  it('esta por vencer entre 54 y 60', () => {
    expect(estadoArriendo(DIAS_POR_VENCER)).toBe('por_vencer');
    expect(estadoArriendo(58)).toBe('por_vencer');
    expect(estadoArriendo(60)).toBe('por_vencer');
  });

  it('genera cargo desde los 61', () => {
    expect(estadoArriendo(61)).toBe('generando_cargo');
    expect(estadoArriendo(92)).toBe('generando_cargo');
  });

  it('CIL-00103, con 58 dias, queda por vencer como pide el criterio 9.4', () => {
    const entrega = sumarDias(HOY, -58);
    const resultado = calcularArriendo({ fechaEntrega: entrega, fechaDevolucion: null }, TARIFA_CHICO, HOY);

    expect(resultado.dias).toBe(58);
    expect(resultado.estado).toBe('por_vencer');
    expect(resultado.importe).toBe(0);
  });
});

// ───────────────────────────────────────────────── El reloj se detiene

describe('el reloj', () => {
  it('se detiene el dia de la devolucion, aunque pase el tiempo', () => {
    const devuelto = { fechaEntrega: '2026-07-01', fechaDevolucion: '2026-10-01' };

    const alDevolver = calcularArriendo(devuelto, TARIFA_GRANDE, '2026-10-01');
    const dosMesesDespues = calcularArriendo(devuelto, TARIFA_GRANDE, '2026-12-01');
    const unAnioDespues = calcularArriendo(devuelto, TARIFA_GRANDE, '2027-10-01');

    expect(alDevolver.importe).toBe(469);
    expect(dosMesesDespues.importe).toBe(469);
    expect(unAnioDespues.importe).toBe(469);
    expect(unAnioDespues.dias).toBe(92);
  });

  it('marca cerrado el arriendo devuelto y abierto el que sigue en el cliente', () => {
    expect(
      calcularArriendo({ fechaEntrega: '2026-07-01', fechaDevolucion: '2026-10-01' }, TARIFA_GRANDE, HOY).abierto,
    ).toBe(false);
    expect(
      calcularArriendo({ fechaEntrega: '2026-07-01', fechaDevolucion: null }, TARIFA_GRANDE, HOY).abierto,
    ).toBe(true);
  });

  it('sigue corriendo hasta hoy mientras el arriendo esta abierto', () => {
    const abierto = { fechaEntrega: '2026-08-05', fechaDevolucion: null };

    expect(calcularArriendo(abierto, TARIFA_CHICO, '2026-11-05').dias).toBe(92);
    expect(calcularArriendo(abierto, TARIFA_CHICO, '2026-11-06').dias).toBe(93);
  });

  it('arranca de cero con cada entrega nueva del mismo cilindro', () => {
    // Mismo cilindro, dos arriendos: uno viejo y largo, otro reciente.
    const primero = calcularArriendo({ fechaEntrega: '2026-06-01', fechaDevolucion: '2026-09-30' }, TARIFA_GRANDE, HOY);
    const segundo = calcularArriendo({ fechaEntrega: '2026-10-28', fechaDevolucion: null }, TARIFA_GRANDE, HOY);

    expect(primero.dias).toBe(121);
    expect(primero.diasFacturables).toBe(61);

    // El segundo no hereda nada del primero.
    expect(segundo.dias).toBe(8);
    expect(segundo.diasFacturables).toBe(0);
    expect(segundo.importe).toBe(0);
    expect(segundo.estado).toBe('en_gracia');
  });
});

// ──────────────────────────────────────────── Tarifa diaria y redondeo

describe('el calculo de la plata', () => {
  it('saca la tarifa diaria dividiendo por 30, sin redondear', () => {
    expect(tarifaDiaria(TARIFA_CHICO)).toBeCloseTo(12.6666667, 6);
    expect(tarifaDiaria(TARIFA_GRANDE)).toBeCloseTo(14.6666667, 6);
  });

  it('redondea el importe a peso entero, no lo trunca', () => {
    // 1 dia a 380/30 = 12,66... Truncar daria 12; el SPEC pide 13.
    expect(importeArriendo(61, TARIFA_CHICO)).toBe(13);
    // 32 dias a 440/30 = 469,33... -> 469
    expect(importeArriendo(92, TARIFA_GRANDE)).toBe(469);
    // 32 dias a 380/30 = 405,33... -> 405
    expect(importeArriendo(92, TARIFA_CHICO)).toBe(405);
  });

  it('redondea una sola vez, al final, y no dia por dia', () => {
    // Redondear la diaria a 13 y multiplicar daria 32 x 13 = 416, no 405.
    expect(importeArriendo(92, TARIFA_CHICO)).toBe(405);
    expect(importeArriendo(92, TARIFA_CHICO)).not.toBe(416);
  });

  it('respeta la tarifa de cada cilindro, no una global', () => {
    expect(importeArriendo(92, TARIFA_CHICO)).toBe(405);
    expect(importeArriendo(92, TARIFA_GRANDE)).toBe(469);
  });

  it('formatea pesos como pide la seccion 3', () => {
    expect(formatearPesos(0)).toBe('$ 0');
    expect(formatearPesos(13)).toBe('$ 13');
    expect(formatearPesos(405)).toBe('$ 405');
    expect(formatearPesos(1234)).toBe('$ 1.234');
    expect(formatearPesos(12345)).toBe('$ 12.345');
    expect(formatearPesos(1234567)).toBe('$ 1.234.567');
    expect(formatearPesos(469.33)).toBe('$ 469');
  });
});

// ────────────────────────────────────────────────── Aritmética de fechas

describe('aritmetica de fechas', () => {
  it('cuenta los dias cruzando meses y anios', () => {
    expect(diasEntre('2026-11-05', '2026-11-05')).toBe(0);
    expect(diasEntre('2026-10-31', '2026-11-01')).toBe(1);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
    expect(diasEntre('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('cuenta bien el 29 de febrero de un anio bisiesto', () => {
    expect(diasEntre('2024-02-28', '2024-03-01')).toBe(2);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('suma y resta dias, para las fechas de la demo', () => {
    expect(sumarDias('2026-11-05', -92)).toBe('2026-08-05');
    expect(sumarDias('2026-11-05', -10)).toBe('2026-10-26');
    expect(sumarDias('2026-11-05', 1)).toBe('2026-11-06');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('rechaza fechas con formato que no es YYYY-MM-DD', () => {
    expect(() => parseFechaISO('5/11/2026')).toThrow(/Fecha invalida|Fecha inválida/);
    expect(() => parseFechaISO('2026-11-5')).toThrow(/Fecha invalida|Fecha inválida/);
    expect(() => parseFechaISO('2026-11-05T00:00:00Z')).toThrow(/Fecha invalida|Fecha inválida/);
    expect(() => parseFechaISO('')).toThrow(/Fecha invalida|Fecha inválida/);
  });

  it('rechaza dias que no existen', () => {
    expect(() => parseFechaISO('2026-13-01')).toThrow(/Fecha inexistente/);
    expect(() => parseFechaISO('2026-11-32')).toThrow(/Fecha inexistente/);
    expect(() => parseFechaISO('2026-02-30')).toThrow(/Fecha inexistente/);
  });

  it('formatea la fecha para mostrar, como en el texto de WhatsApp de 6.4', () => {
    expect(formatearFecha('2026-08-05')).toBe('05/08/2026');
    expect(formatearFecha('2026-11-05')).toBe('05/11/2026');
    expect(formatearFecha('2026-01-01')).toBe('01/01/2026');
    expect(formatearFecha('2024-02-29')).toBe('29/02/2024');
  });

  it('formatearFecha no se corre un dia ni acepta basura', () => {
    expect(formatearFecha(sumarDias('2026-11-05', -92))).toBe('05/08/2026');
    expect(() => formatearFecha('5/11/2026')).toThrow();
    expect(() => formatearFecha('2026-02-30')).toThrow();
  });
});

// ───────────────────────────── Zona horaria America/Montevideo (sección 5)

describe('zona horaria America/Montevideo', () => {
  it('los tests corren de verdad en America/Montevideo, UTC-3', () => {
    // Si el TZ no agarro, este bloque entero no probaria nada: mejor que falle aca.
    // Montevideo no tiene horario de verano desde 2015, asi que el offset es fijo.
    expect(new Date().getTimezoneOffset()).toBe(180);
  });

  it('un cilindro entregado hoy da 0 dias, no -1', () => {
    const hoy = hoyISO();
    expect(diasTranscurridos(hoy, null, hoy)).toBe(0);
  });

  it('el arriendo de un cilindro entregado hoy no genera cargo', () => {
    const hoy = hoyISO();
    const resultado = calcularArriendo({ fechaEntrega: hoy, fechaDevolucion: null }, TARIFA_GRANDE, hoy);

    expect(resultado.dias).toBe(0);
    expect(resultado.importe).toBe(0);
    expect(resultado.estado).toBe('en_gracia');
  });

  it('parsear una fecha y volver a texto no la corre un dia', () => {
    // Con el bug clasico, 2026-11-05 vuelve como 2026-11-04.
    for (const fecha of ['2026-11-05', '2026-01-01', '2026-12-31', '2024-02-29', '2026-07-01']) {
      expect(aFechaISO(parseFechaISO(fecha))).toBe(fecha);
    }
  });

  it('hoyISO usa el dia de pared en Montevideo, no el de UTC', () => {
    // A las 02:30 UTC del 5 de noviembre, en Montevideo son las 23:30 del 4.
    expect(hoyISO(new Date('2026-11-05T02:30:00Z'))).toBe('2026-11-04');
    // Y a las 03:30 UTC ya es el 5 tambien en Montevideo.
    expect(hoyISO(new Date('2026-11-05T03:30:00Z'))).toBe('2026-11-05');
  });

  it('cuenta los dias igual sin importar la hora del dia', () => {
    const entrega = hoyISO(new Date('2026-08-05T23:59:00Z'));
    const hasta = hoyISO(new Date('2026-11-05T00:01:00Z'));

    // El 5 de agosto a las 23:59 UTC ya es el 5 en Montevideo (20:59),
    // y el 5 de noviembre a las 00:01 UTC todavia es el 4 (21:01).
    expect(entrega).toBe('2026-08-05');
    expect(hasta).toBe('2026-11-04');
    expect(diasEntre(entrega, hasta)).toBe(91);
  });
});

// ───────────────────────────────── Criterios de aceptación de la sección 9

describe('criterios de aceptacion del SPEC', () => {
  it('9.3: CIL-00101, grande con 92 dias, figura con 469 pesos', () => {
    const entrega = sumarDias(HOY, -92);
    const resultado = calcularArriendo({ fechaEntrega: entrega, fechaDevolucion: null }, TARIFA_GRANDE, HOY);

    expect(resultado.dias).toBe(92);
    expect(resultado.importe).toBe(469);
    expect(formatearPesos(resultado.importe)).toBe('$ 469');
    expect(resultado.estado).toBe('generando_cargo');
  });

  it('9.5: los avisos listan CIL-00101, CIL-00102 y CIL-00103, de mas atrasado a menos', () => {
    const cilindros = [
      { serie: 'CIL-00103', dias: 58, tarifa: TARIFA_CHICO },
      { serie: 'CIL-00101', dias: 92, tarifa: TARIFA_GRANDE },
      { serie: 'CIL-00104', dias: 20, tarifa: TARIFA_CHICO },
      { serie: 'CIL-00102', dias: 75, tarifa: TARIFA_GRANDE },
    ];

    const avisos = cilindros
      .map((c) => ({
        serie: c.serie,
        ...calcularArriendo(
          { fechaEntrega: sumarDias(HOY, -c.dias), fechaDevolucion: null },
          c.tarifa,
          HOY,
        ),
      }))
      .filter((c) => c.dias >= DIAS_POR_VENCER)
      .sort((a, b) => b.dias - a.dias);

    expect(avisos.map((a) => a.serie)).toEqual(['CIL-00101', 'CIL-00102', 'CIL-00103']);
    expect(avisos.map((a) => a.dias)).toEqual([92, 75, 58]);
  });

  it('9.7: al devolver un cilindro, su reloj se detiene', () => {
    const entrega = sumarDias(HOY, -92);

    const enElCliente = calcularArriendo({ fechaEntrega: entrega, fechaDevolucion: null }, TARIFA_GRANDE, HOY);
    const devueltoHoy = calcularArriendo({ fechaEntrega: entrega, fechaDevolucion: HOY }, TARIFA_GRANDE, HOY);
    const unMesDespues = calcularArriendo({ fechaEntrega: entrega, fechaDevolucion: HOY }, TARIFA_GRANDE, sumarDias(HOY, 30));

    expect(enElCliente.abierto).toBe(true);
    expect(devueltoHoy.abierto).toBe(false);
    expect(devueltoHoy.importe).toBe(enElCliente.importe);
    expect(unMesDespues.dias).toBe(92);
    expect(unMesDespues.importe).toBe(469);
  });
});
