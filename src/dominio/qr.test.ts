import { describe, expect, it } from 'vitest';

import { PREFIJO_QR, pareceSerie, serieDesdeQR, serieTipeada, textoQR } from './qr';

describe('serieDesdeQR', () => {
  it('saca la serie de un QR nuestro', () => {
    expect(serieDesdeQR('GONGAS:CIL-00123')).toBe('CIL-00123');
    expect(serieDesdeQR('GONGAS:CIL-00101')).toBe('CIL-00101');
  });

  it('ignora los codigos ajenos, que es para lo que esta el prefijo', () => {
    // En escaneo continuo, sin el prefijo estos entrarían solos al lote.
    expect(serieDesdeQR('https://www.ancap.com.uy')).toBeNull();
    expect(serieDesdeQR('CIL-00123')).toBeNull();
    expect(serieDesdeQR('7730100000119')).toBeNull();
    expect(serieDesdeQR('OTRAEMPRESA:CIL-00123')).toBeNull();
    expect(serieDesdeQR('')).toBeNull();
    expect(serieDesdeQR('   ')).toBeNull();
  });

  it('no acepta el prefijo sin serie', () => {
    expect(serieDesdeQR('GONGAS:')).toBeNull();
    expect(serieDesdeQR('GONGAS:   ')).toBeNull();
  });

  it('tolera espacios y mayusculas, porque su trabajo es filtrar, no corregir', () => {
    expect(serieDesdeQR('  GONGAS:CIL-00123  ')).toBe('CIL-00123');
    expect(serieDesdeQR('gongas:cil-00123')).toBe('CIL-00123');
    expect(serieDesdeQR('GONGAS: CIL-00123')).toBe('CIL-00123');
  });

  it('va y vuelve con textoQR', () => {
    for (const serie of ['CIL-00101', 'CIL-00107', 'CIL-99999']) {
      expect(serieDesdeQR(textoQR(serie))).toBe(serie);
    }
  });
});

describe('textoQR', () => {
  it('arma lo que va impreso en la etiqueta', () => {
    expect(textoQR('CIL-00123')).toBe('GONGAS:CIL-00123');
    expect(textoQR('CIL-00123').startsWith(PREFIJO_QR)).toBe(true);
  });
});

describe('serieTipeada', () => {
  it('acepta la serie pelada, que es lo que se tipea a mano', () => {
    expect(serieTipeada('CIL-00105')).toBe('CIL-00105');
    expect(serieTipeada('  cil-00105  ')).toBe('CIL-00105');
  });

  it('acepta tambien el contenido crudo del QR, por si lo pegan', () => {
    expect(serieTipeada('GONGAS:CIL-00107')).toBe('CIL-00107');
  });

  it('rechaza lo que no parece una serie', () => {
    // Sin esto, pegar una URL en el campo la mete al lote como si fuera un cilindro.
    expect(serieTipeada('https://www.ancap.com.uy')).toBeNull();
    expect(serieTipeada('el cilindro de la esquina')).toBeNull();
    expect(serieTipeada('')).toBeNull();
    expect(serieTipeada('   ')).toBeNull();
    expect(serieTipeada('A')).toBeNull();
    expect(serieTipeada('CIL/00105')).toBeNull();
  });

  it('pareceSerie mira la forma, no el padron', () => {
    expect(pareceSerie('CIL-00105')).toBe(true);
    expect(pareceSerie('CIL-99999')).toBe(true);
    expect(pareceSerie('X1')).toBe(true);
    expect(pareceSerie('-CIL')).toBe(false);
    expect(pareceSerie('CIL 00105')).toBe(false);
  });
});
