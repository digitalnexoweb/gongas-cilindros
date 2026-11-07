import { describe, expect, it } from 'vitest';

import { linkWhatsApp, textoAviso, textoComprobante } from './mensajes';
import type { Cliente } from './tipos';

const ANCAP: Cliente = {
  id: 'cli-ancap',
  nombre: 'ANCAP',
  tipo: 'empresa',
  documento: '211003420017',
  telefono: '+59899100101',
};

describe('textoComprobante', () => {
  it('lista las series, el cliente y la fecha, como pide 6.1', () => {
    const texto = textoComprobante({
      tipo: 'entrega',
      series: ['CIL-00105', 'CIL-00106', 'CIL-00107'],
      cliente: ANCAP,
      fecha: '2026-11-05',
    });

    expect(texto).toBe(
      [
        'GONGAS — Entrega del 05/11/2026',
        'Cliente: ANCAP',
        '3 cilindros:',
        '- CIL-00105',
        '- CIL-00106',
        '- CIL-00107',
      ].join('\n'),
    );
  });

  it('distingue la entrega de la devolucion', () => {
    const devolucion = textoComprobante({
      tipo: 'devolucion',
      series: ['CIL-00101'],
      cliente: null,
      fecha: '2026-11-05',
    });

    expect(devolucion).toContain('Devolución del 05/11/2026');
    expect(devolucion).not.toContain('Cliente:');
    expect(devolucion).toContain('1 cilindro:');
    expect(devolucion).not.toContain('1 cilindros');
  });

  it('usa el formato de fecha de 6.4, no el ISO', () => {
    const texto = textoComprobante({
      tipo: 'entrega',
      series: ['CIL-00101'],
      cliente: ANCAP,
      fecha: '2026-08-05',
    });

    expect(texto).toContain('05/08/2026');
    expect(texto).not.toContain('2026-08-05');
  });
});

describe('textoAviso', () => {
  it('de 61 dias en adelante usa el texto de 6.4 palabra por palabra', () => {
    // Es el ejemplo literal del SPEC, con sus propios numeros.
    expect(
      textoAviso({
        serie: 'CIL-00123',
        fechaEntrega: '2026-08-05',
        dias: 92,
        importe: 405,
      }),
    ).toBe(
      'Hola, les recordamos que el cilindro CIL-00123 está en su poder desde el 05/08/2026 ' +
        '(92 días). A partir del día 61 genera un arrendamiento de $ 405 a la fecha. ' +
        'Cualquier duda quedamos a las órdenes. GONGAS',
    );
  });

  it('a los 61 justos ya usa el texto de cargo', () => {
    const texto = textoAviso({
      serie: 'CIL-00101',
      fechaEntrega: '2026-09-05',
      dias: 61,
      importe: 13,
    });

    expect(texto).toContain('genera un arrendamiento de $ 13 a la fecha');
  });

  it('de 54 a 60 avisa cuanto le queda, sin decir "$ 0 a la fecha"', () => {
    const texto = textoAviso({
      serie: 'CIL-00103',
      fechaEntrega: '2026-09-09',
      dias: 58,
      importe: 0,
    });

    expect(texto).toContain('le quedan 2 días sin cargo');
    expect(texto).not.toContain('$ 0');
    expect(texto).toContain('CIL-00103');
    expect(texto).toContain('09/09/2026');
    expect(texto).toContain('(58 días)');
    expect(texto.endsWith('Cualquier duda quedamos a las órdenes. GONGAS')).toBe(true);
  });

  it('a los 59 habla de un solo dia, en singular', () => {
    expect(textoAviso({ serie: 'X', fechaEntrega: '2026-09-08', dias: 59, importe: 0 })).toContain(
      'le queda 1 día sin cargo',
    );
  });

  it('a los 60 justos dice que empieza manana, no que le quedan 0 dias', () => {
    const texto = textoAviso({ serie: 'X', fechaEntrega: '2026-09-07', dias: 60, importe: 0 });

    expect(texto).toContain('Mañana cumple 61 días y empieza a generar arrendamiento');
    expect(texto).not.toContain('0 días sin cargo');
  });
});

describe('linkWhatsApp', () => {
  it('deja el telefono en digitos pelados, que es lo que quiere wa.me', () => {
    expect(linkWhatsApp('+59899100101', 'hola')).toContain('wa.me/59899100101?');
    expect(linkWhatsApp('+598 99 100 101', 'hola')).toContain('wa.me/59899100101?');
    expect(linkWhatsApp('(598) 99-100-101', 'hola')).toContain('wa.me/59899100101?');
  });

  it('codifica el texto, saltos de linea incluidos', () => {
    const link = linkWhatsApp('+59899100101', 'GONGAS — Entrega\n- CIL-00101');

    expect(link).toContain('%0A'); // el salto de línea
    expect(link).not.toContain('\n');
    expect(link).not.toContain(' ');
    expect(decodeURIComponent(link.split('?text=')[1] ?? '')).toBe(
      'GONGAS — Entrega\n- CIL-00101',
    );
  });

  it('arma un link que se puede abrir tal cual', () => {
    const link = linkWhatsApp('+59899100101', 'hola');
    expect(() => new URL(link)).not.toThrow();
    expect(new URL(link).origin).toBe('https://wa.me');
  });
});
