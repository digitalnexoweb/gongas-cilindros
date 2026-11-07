/**
 * Descarga un texto como archivo.
 *
 * El `﻿` del principio es el BOM de UTF-8, y no es un detalle: sin él,
 * Excel abre el CSV con los acentos rotos y "días facturables" sale ilegible.
 */
export function descargarTexto(
  nombre: string,
  texto: string,
  tipo = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob(['﻿', texto], { type: tipo });
  const url = URL.createObjectURL(blob);

  const ancla = document.createElement('a');
  ancla.href = url;
  ancla.download = nombre;
  document.body.appendChild(ancla);
  ancla.click();
  ancla.remove();

  URL.revokeObjectURL(url);
}
