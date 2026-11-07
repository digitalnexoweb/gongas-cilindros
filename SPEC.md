# Prototipo GONGAS — Control de cilindros

Especificación para construir con Claude Code. Versión prototipo demostrable, 5 de noviembre de 2026.

---

## 1. Para qué es esto

Es un **prototipo para mostrarle al cliente**, no el sistema final. El objetivo es que Joaquín abra un link desde su celular, escanee un QR pegado en un cilindro y vea funcionar el ciclo completo: entrega, el reloj de los 60 días, el aviso y el resumen del mes.

Se busca que el prototipo **responda las preguntas abiertas mostrando una implementación concreta**. En vez de preguntarle cómo se calcula el cargo diario, se le muestra una pantalla con el número calculado y se le pregunta si ese es el número correcto.

Criterio de éxito: Joaquín escanea un cilindro, se lo entrega a ANCAP, ve el contador arrancar y entiende el sistema sin que nadie se lo explique.

---

## 2. Alcance

### Entra en el prototipo

- Alta de cilindros y clientes.
- Escaneo de QR por lotes, con dos movimientos: **entrega** y **devolución**.
- Reloj de arriendo por cilindro, con los 60 días gratis y el cargo diario a partir del 61.
- Pantalla de avisos de los cilindros que llegan a los 60 días.
- Resumen mensual por cliente, exportable a CSV.
- Generador de etiquetas QR imprimibles, para poder hacer la demo en papel.

### Queda deliberadamente afuera

No implementar nada de esto, aunque parezca que falta:

- Login, usuarios y permisos por rol.
- Las tres unidades de negocio separadas (acetileno, CO₂, gases especiales).
- Envío automático de WhatsApp. El aviso genera un **link `wa.me` con el texto ya armado**, nada más.
- Estados "lleno", "vacío" y "en carga". Todo lo que no está en un cliente es **stock**.
- Backend, base de datos remota, autenticación, multiusuario.
- Facturación, integración contable, pagos.
- Modo sin conexión.

Si durante el desarrollo aparece la tentación de agregar algo de esta lista, no se agrega: se anota como pendiente y se sigue.

---

## 3. Stack y restricciones

| Decisión | Elección | Motivo |
| --- | --- | --- |
| Framework | Vite + React + TypeScript | Rápido de levantar y de evolucionar al sistema real |
| Estilos | Tailwind CSS | Sin tiempo perdido en CSS |
| Datos | `localStorage`, detrás de una capa `storage.ts` | Cero backend; cambiar a Supabase después toca un solo archivo |
| Lectura de QR | `BarcodeDetector` nativo, con `@zxing/browser` de respaldo | Todos los dispositivos del cliente son Android, donde Chrome lo soporta nativo |
| Generación de QR | `qrcode` | Para imprimir las etiquetas de la demo |
| Deploy | Cloudflare Pages | Link para mandar por WhatsApp, y HTTPS, que la cámara exige |

Restricciones firmes:

- **Mobile first.** Se diseña para un celular Android sostenido con una mano. El escritorio es secundario.
- Todo en **español rioplatense**. Pesos uruguayos, formato `$ 1.234`.
- Las fechas se manejan como texto `YYYY-MM-DD`, sin horas y sin conversión de zona horaria.
- Toda la lógica de plata vive en `src/dominio/arriendo.ts`, sin importar nada de React.

---

## 4. Modelo de datos

```ts
type Tamano = 'chico' | 'grande';

type Cilindro = {
  id: string;
  serie: string;          // único, va en el QR. Ej: "CIL-00123"
  tipoGas: string;        // "acetileno" en el prototipo
  tamano: Tamano;
  tarifaMensual: number;  // 380 chico, 440 grande; editable por cilindro
  activo: boolean;
};

type Cliente = {
  id: string;
  nombre: string;
  tipo: 'empresa' | 'particular';
  documento: string;      // RUT o CI
  telefono: string;       // con código de país, para el link de WhatsApp
};

// Un arriendo se abre con cada entrega y se cierra con la devolución.
type Arriendo = {
  id: string;
  cilindroId: string;
  clienteId: string;
  fechaEntrega: string;   // YYYY-MM-DD
  fechaDevolucion: string | null;
};

// Registro inmutable. Nunca se edita ni se borra.
type Movimiento = {
  id: string;
  tipo: 'entrega' | 'devolucion';
  cilindroId: string;
  clienteId: string | null;
  fecha: string;
  loteId: string;
  operador: string;       // nombre elegido al abrir la app
};
```

**La ubicación de un cilindro nunca se guarda como campo.** Se deduce: si tiene un arriendo abierto está en ese cliente, si no, está en stock. Esta regla no se negocia, porque es lo que impide que el estado y el historial se contradigan.

---

## 5. Reglas de negocio

Todo esto va en `src/dominio/arriendo.ts`, como funciones puras.

### El reloj

1. El reloj arranca el día de la **entrega** de ese cilindro a ese cliente.
2. Los **primeros 60 días son gratis**.
3. **A partir del día 61** el cilindro genera cargo, por día.
4. El reloj se detiene el día de la **devolución**.
5. Cada entrega nueva abre un arriendo nuevo, con su propio reloj desde cero.

### El cálculo

```
diasTranscurridos = (fechaDevolucion ?? hoy) - fechaEntrega   // en días enteros
diasFacturables   = max(0, diasTranscurridos - 60)
tarifaDiaria      = tarifaMensual / 30                        // sin redondear
importe           = redondear(diasFacturables * tarifaDiaria) // a peso entero
```

Casos que deben pasar como test antes de escribir una sola pantalla:

| Caso | Entrega | Hasta | Días | Facturables | Tarifa mensual | Importe |
| --- | --- | --- | --- | --- | --- | --- |
| Dentro de la gracia | 2026-10-20 | 2026-11-05 | 16 | 0 | 380 | $ 0 |
| Justo en el límite | 2026-09-06 | 2026-11-05 | 60 | 0 | 380 | $ 0 |
| Primer día con cargo | 2026-09-05 | 2026-11-05 | 61 | 1 | 380 | $ 13 |
| Cilindro chico atrasado | 2026-08-05 | 2026-11-05 | 92 | 32 | 380 | $ 405 |
| Cilindro grande atrasado | 2026-08-22 | 2026-11-05 | 75 | 15 | 440 | $ 220 |
| Devuelto, reloj detenido | 2026-07-01 | 2026-10-01 (dev.) | 92 | 32 | 440 | $ 469 |

### Estados del arriendo

| Estado | Condición | Color |
| --- | --- | --- |
| En gracia | días ≤ 53 | neutro |
| Por vencer | 54 ≤ días ≤ 60 | ámbar |
| Generando cargo | días ≥ 61 | rojo |

### Fechas

Prohibido usar `new Date(texto).getDate()` y similares: al oeste de Greenwich devuelven el día anterior. Las fechas se parsean y se restan como texto `YYYY-MM-DD` o con `Date.UTC`. Hay que escribir un test que corra con la zona horaria `America/Montevideo` y verifique que un cilindro entregado hoy da 0 días, no −1.

---

## 6. Pantallas

Navegación inferior fija, de cinco ítems, con el pulgar al alcance.

### 6.1 Escanear (pantalla de inicio)

1. Dos botones grandes: **Entregar** y **Recibir**.
2. Si es entrega, se elige el cliente de una lista con buscador, más un botón **Cliente nuevo** que abre un alta mínima en el momento: nombre, tipo, documento y teléfono.
3. Se abre la cámara en modo escaneo continuo. Cada lectura válida suma a una lista, con vibración y un sonido corto.
4. Bajo la cámara, el contador: "4 cilindros en este lote", con la lista y una X para sacar cualquiera.
5. Botón **Confirmar lote**, que graba los movimientos y muestra el comprobante.

Validaciones, que avisan pero **no bloquean**:

- Serie repetida en el mismo lote: se ignora y avisa.
- Entrega de un cilindro que ya figura en otro cliente: avisa en ámbar y deja seguir.
- Devolución de un cilindro que ya figura en stock: avisa en ámbar y deja seguir.
- QR que no empieza con `GONGAS:`: se ignora en silencio.
- Serie desconocida: ofrece darla de alta en el momento.

El comprobante del lote lista las series, el cliente y la fecha, con un botón para copiarlo como texto y otro que arma un link de WhatsApp.

### 6.2 Cilindros

Lista de todos los cilindros, con filtros por estado y buscador por serie. Cada fila: serie, tamaño, dónde está, días transcurridos y lo acumulado. Al tocar, se abre la ficha con el historial completo de movimientos.

### 6.3 Clientes

Un cliente por fila: nombre, cuántos cilindros tiene y cuánto acumula en total. Al tocar, el detalle de cada cilindro con sus días y su importe.

### 6.4 Avisos

El corazón del sistema. Lista los arriendos con 54 días o más, ordenados por los más atrasados primero. Cada fila muestra el cliente, la serie, los días y el importe acumulado, con un botón **Avisar por WhatsApp** que abre `wa.me` con el texto ya escrito:

> Hola, les recordamos que el cilindro CIL-00123 está en su poder desde el 05/08/2026 (92 días). A partir del día 61 genera un arrendamiento de $ 405 a la fecha. Cualquier duda quedamos a las órdenes. GONGAS

### 6.5 Resumen del mes

Selector de mes. Una tabla por cliente: cilindros, días facturables y total. El total general abajo. Botón de exportar a CSV.

### 6.6 Etiquetas (fuera de la navegación, en Ajustes)

Grilla imprimible con el QR de cada cilindro y la serie escrita debajo en texto grande. Pensada para imprimir en una hoja A4, recortar y pegar. Sin esto no se puede hacer la demo.

---

## 7. Datos de demo

Se cargan solos la primera vez, y hay un botón **Reiniciar demo** en Ajustes.

**Importante:** las fechas de entrega se calculan como `hoy − N días`, nunca se escriben fijas. Así la demo sigue siendo coherente la semana que viene.

**Clientes:** ANCAP (empresa), Armada Nacional (empresa), Taller Pereira (particular).

**Cilindros**, todos de acetileno:

| Serie | Tamaño | Situación | Días |
| --- | --- | --- | --- |
| CIL-00101 | grande | En ANCAP | 92 |
| CIL-00102 | grande | En ANCAP | 75 |
| CIL-00103 | chico | En Armada Nacional | 58 |
| CIL-00104 | chico | En Taller Pereira | 20 |
| CIL-00105 | grande | En stock | — |
| CIL-00106 | chico | En stock | — |
| CIL-00107 | chico | En stock, devuelto hace 10 días | — |

Esa mezcla hace que la pantalla de avisos tenga algo que mostrar apenas se abre, que haya un caso al borde y que quede stock para escanear en vivo.

---

## 8. Etiquetas QR

- Contenido del QR: `GONGAS:CIL-00123`. El prefijo evita leer códigos ajenos por accidente.
- Debajo del QR, la serie en texto legible, por si la etiqueta se daña.
- Para el sistema real conviene probar la etiqueta en 5 cilindros durante un mes antes de etiquetar todo, por los golpes, la humedad y el aceite.

---

## 9. Criterios de aceptación

El prototipo está listo cuando, desde un celular Android y con el link publicado:

1. Se escanea un QR impreso y la app reconoce la serie en menos de dos segundos.
2. Se entregan tres cilindros a ANCAP en un solo lote y aparecen los tres en la ficha de ANCAP.
3. CIL-00101 figura con 92 días y $ 469 acumulados.
4. CIL-00103 figura en ámbar, como "por vencer".
5. La pantalla de avisos lista CIL-00101, CIL-00102 y CIL-00103, en ese orden.
6. El botón de WhatsApp abre la app con el texto completo y correcto.
7. Se devuelve CIL-00101, su reloj se detiene y pasa a stock.
8. El resumen del mes exporta un CSV que abre bien en Excel.
9. Todos los tests de `arriendo.test.ts` pasan.
10. La app se usa entera con una sola mano, sin zoom.

---

## 10. Orden de trabajo sugerido

1. `src/dominio/arriendo.ts` y sus tests, con la tabla de casos del punto 5. **Nada de UI hasta que pasen.**
2. `src/dominio/storage.ts`, la capa de datos, con los datos de demo.
3. Pantalla de cilindros y de clientes, que son solo lectura y validan el modelo.
4. Pantalla de escaneo, que es la de mayor riesgo técnico.
5. Avisos y resumen del mes.
6. Generador de etiquetas.
7. Deploy a Cloudflare Pages.

---

## 11. Prompt de arranque para Claude Code

```
Leé SPEC.md completo antes de escribir una línea.

Es un prototipo para mostrarle a un cliente, no el sistema final. La sección 2
dice qué queda afuera: respetala, aunque parezca que falta algo.

Entrá en plan mode y proponeme el plan para el punto 1 del orden de trabajo:
el módulo de dominio src/dominio/arriendo.ts con sus tests, cubriendo la tabla
de casos de la sección 5 y el test de zona horaria America/Montevideo.

No escribas UI todavía. Cuando los tests pasen, frená y mostrame el resultado.
```

Después de cada punto del orden de trabajo, el mismo patrón: plan mode, revisión, implementación, revisión. El riesgo real en este proyecto es que la lógica de plata quede mal y se descubra delante del cliente.
