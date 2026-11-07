# Guion de la demo

Para tener en la mano el día que se lo mostrás a Joaquín.

## Antes de salir

1. **Imprimí la hoja de etiquetas.** Ajustes (el engranaje en Escanear) → Etiquetas QR → Imprimir.
   Salen 15 por hoja A4; los 7 cilindros de la demo entran en una.
2. **Recortá y pegá** al menos CIL-00105, CIL-00106 y CIL-00107, que son los que están en stock y
   los que vas a escanear en vivo.
3. **Abrí el link en el celular** y cargá tu nombre cuando lo pida.
4. **Ajustes → Reiniciar demo**, para arrancar limpio. Las fechas se recalculan desde hoy, así que
   los números siempre dan igual aunque pase una semana.

## El recorrido, en cinco minutos

| Paso | Qué mostrar | Qué tiene que pasar |
| --- | --- | --- |
| 1 | **Avisos** | Tres cilindros, el más atrasado arriba: CIL-00101 con 92 días y $ 469 |
| 2 | Tocá **Avisar por WhatsApp** en CIL-00101 | Se abre WhatsApp con el texto ya escrito |
| 3 | **Cilindros** → CIL-00101 | La ficha con el historial completo de movimientos |
| 4 | **Escanear → Entregar → ANCAP** | Escaneá tres etiquetas seguidas: suenan y vibran |
| 5 | **Confirmar lote** | El comprobante con las tres series |
| 6 | **Clientes → ANCAP** | Pasó de 2 a 5 cilindros, los nuevos con 0 días |
| 7 | **Escanear → Recibir** → CIL-00101 | El reloj se detiene y vuelve a stock |
| 8 | **Resumen del mes** | Cambiá de mes y exportá el CSV |

La pregunta que conviene hacerle en el paso 1 es la del spec: **¿ese es el número correcto?** El
prototipo existe para que conteste eso mirando una pantalla, no para explicarle una fórmula.

## Los criterios de aceptación de la sección 9

| # | Criterio | Estado |
| --- | --- | --- |
| 9.1 | Reconoce un QR impreso en menos de 2 s | **Falta probar en el celular** |
| 9.2 | Tres cilindros a ANCAP en un lote aparecen en su ficha | Verificado |
| 9.3 | CIL-00101 con 92 días y $ 469 | Verificado |
| 9.4 | CIL-00103 en ámbar, por vencer | Verificado |
| 9.5 | Avisos lista 00101, 00102, 00103 en ese orden | Verificado |
| 9.6 | El botón de WhatsApp abre con el texto correcto | Texto verificado palabra por palabra; **que abra WhatsApp, falta en el celular** |
| 9.7 | Al devolver CIL-00101 el reloj se detiene | Verificado |
| 9.8 | El CSV abre bien en Excel | Bytes verificados: separador `;` y BOM; **abrirlo en Excel, falta** |
| 9.9 | Todos los tests pasan | Verificado: 158 |
| 9.10 | Se usa con una sola mano, sin zoom | Sin scroll horizontal a 375 px; **el juicio final es tuyo, con el celular en la mano** |

Lo que falta tiene algo en común: **necesita un celular de verdad**. En particular el 9.1, que es el
único que ejercita el camino nativo de `BarcodeDetector`, el que va a usar Joaquín. Todo lo que se
probó hasta ahora corrió por el respaldo de zxing.

## Si algo falla en vivo

- **La cámara no abre.** Tiene que ser por HTTPS. Si abriste el link por IP de red local, Chrome la
  niega sin avisar por qué. Usá el link publicado.
- **No lee la etiqueta.** Bajo la cámara hay un botón **Cargar a mano**: tipeás la serie y seguís.
  Está puesto justamente para esto.
- **Se desordenaron los datos.** Ajustes → Reiniciar demo deja todo como al principio.

## Lo que queda deliberadamente afuera

Si pregunta por login, por las tres unidades de negocio, por el WhatsApp automático o por los
estados "lleno" y "vacío": **no están, y es a propósito**. La sección 2 del spec los dejó afuera
para que el prototipo se pueda mostrar esta semana y no dentro de tres meses. Es una buena
conversación para tener con él, no un agujero que tapar.
