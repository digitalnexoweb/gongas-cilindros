import { describe, expect, it } from 'vitest';

import { sumarDias } from './arriendo';
import {
  etapaDeAviso,
  htmlDelAviso,
  mailsPendientes,
  proximoMail,
  type DatosAvisosPorMail,
} from './avisosPorMail';
import { TEXTOS_AVISO_ORIGINALES } from './mensajes';

const HOY = '2026-11-06';

function arriendo(
  serie: string,
  dias: number,
  extra: Partial<DatosAvisosPorMail['arriendos'][number]> = {},
): DatosAvisosPorMail['arriendos'][number] {
  return {
    arriendo_id: `a-${serie}`,
    cliente: 'ANCAP',
    email: 'compras@ancap.test',
    serie,
    fecha_entrega: sumarDias(HOY, -dias),
    tarifa_mensual: '440.00',
    etapas_enviadas: [],
    ...extra,
  };
}

function datos(arriendos: DatosAvisosPorMail['arriendos'], copia = 'info@gongasuruguay.com'): DatosAvisosPorMail {
  return {
    hoy: HOY,
    textos: {
      con_cargo: TEXTOS_AVISO_ORIGINALES.conCargo,
      por_vencer: TEXTOS_AVISO_ORIGINALES.porVencer,
      copia_mail: copia,
    },
    arriendos,
  };
}

describe('etapaDeAviso', () => {
  it.each([
    [53, null],
    [54, 'por_vencer'],
    [60, 'por_vencer'],
    [61, 'con_cargo'],
    [200, 'con_cargo'],
  ])('a los %d días: %s', (dias, esperado) => {
    expect(etapaDeAviso(dias)).toBe(esperado);
  });
});

describe('mailsPendientes', () => {
  it('arma el de cargo con el importe de arriendo.ts, el mismo de la app', () => {
    // CIL-00101 grande, 92 días: los $ 469 del criterio 9.3.
    const [mail] = mailsPendientes(datos([arriendo('CIL-00101', 92)]));

    expect(mail?.etapa).toBe('con_cargo');
    expect(mail?.texto).toContain('$ 469 a la fecha');
    expect(mail?.texto).toContain('Hola ANCAP,');
    expect(mail?.asunto).toBe('GONGAS — aviso del cilindro CIL-00101');
    expect(mail?.para).toEqual({ email: 'compras@ancap.test', nombre: 'ANCAP' });
    expect(mail?.copiaOculta).toBe('info@gongasuruguay.com');
  });

  it('arma el de por vencer con los días que le quedan', () => {
    const [mail] = mailsPendientes(datos([arriendo('CIL-00103', 57, { tarifa_mensual: 380 })]));

    expect(mail?.etapa).toBe('por_vencer');
    expect(mail?.texto).toContain('le quedan 3 días sin cargo');
  });

  it('no repite una etapa que ya salió', () => {
    expect(mailsPendientes(datos([arriendo('CIL-00101', 92, { etapas_enviadas: ['con_cargo'] })]))).toEqual([]);
  });

  it('el de por vencer enviado no impide el de cargo cuando llega', () => {
    const mails = mailsPendientes(datos([arriendo('CIL-00101', 61, { etapas_enviadas: ['por_vencer'] })]));
    expect(mails.map((m) => m.etapa)).toEqual(['con_cargo']);
  });

  it('un cilindro que ya pasó los 61 no recibe el de por vencer atrasado', () => {
    const mails = mailsPendientes(datos([arriendo('CIL-00101', 92)]));
    expect(mails.map((m) => m.etapa)).toEqual(['con_cargo']);
  });

  it('antes de los 54, nada', () => {
    expect(mailsPendientes(datos([arriendo('CIL-00105', 53)]))).toEqual([]);
  });

  it('sin mail del cliente, nada', () => {
    expect(mailsPendientes(datos([arriendo('CIL-00101', 92, { email: '  ' })]))).toEqual([]);
  });

  it('sin tarifa, el de cargo no sale con el hueco vacío', () => {
    expect(mailsPendientes(datos([arriendo('CIL-00101', 92, { tarifa_mensual: null })]))).toEqual([]);
  });

  it('con la copia oculta vacía, no hay copia', () => {
    const [mail] = mailsPendientes(datos([arriendo('CIL-00101', 92)], ''));
    expect(mail?.copiaOculta).toBeNull();
  });

  it('usa el texto que editó Joaquín', () => {
    const d = datos([arriendo('CIL-00101', 92)]);
    d.textos.con_cargo = 'Estimados {cliente}: {serie} lleva {dias} días, {importe}.';

    expect(mailsPendientes(d)[0]?.texto).toBe('Estimados ANCAP: CIL-00101 lleva 92 días, $ 469.');
  });
});

describe('htmlDelAviso', () => {
  it('escapa lo que podría romper el HTML y respeta los saltos de línea', () => {
    const html = htmlDelAviso('Hola <ANCAP> & cía\nsegunda línea\n\notro párrafo');

    expect(html).toContain('Hola &lt;ANCAP&gt; &amp; cía<br>segunda línea');
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

describe('proximoMail', () => {
  it.each([
    [{ email: '', dias: 92, etapasEnviadas: [] }, 'sin_mail'],
    [{ email: 'a@b.test', dias: 20, etapasEnviadas: [] }, 'nada'],
    [{ email: 'a@b.test', dias: 57, etapasEnviadas: [] }, 'sale_a_las_9'],
    [{ email: 'a@b.test', dias: 57, etapasEnviadas: ['por_vencer'] }, 'ya_salio'],
    [{ email: 'a@b.test', dias: 61, etapasEnviadas: ['por_vencer'] }, 'sale_a_las_9'],
  ] as const)('%j → %s', (entrada, esperado) => {
    expect(proximoMail({ ...entrada, etapasEnviadas: [...entrada.etapasEnviadas] })).toBe(esperado);
  });
});
