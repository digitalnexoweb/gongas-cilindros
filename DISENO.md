# DISEÑO — app GONGAS

Guía visual del prototipo de control de cilindros. Acompaña a `SPEC.md`: el SPEC dice **qué hace** la app, este archivo dice **cómo se ve y se toca**.

Contexto de uso, que es de donde sale cada decisión: celular Android, sostenido con una mano, en un depósito, a veces al sol y a veces con guantes. Contraste alto, objetivos grandes, y ningún estado que se distinga solo por color.

---

## 1. Marca

Dos colores, los dos salen del logo: **azul marino** y **rojo**.

- El **azul marino** `#1C2D5F` es el color de acción: botones principales, ítem activo de la navegación, encabezados de color, totales.
- El **rojo** `#CE2027` es de marca. En la interfaz aparece solo en el logo. Su versión oscura `#A81D24` queda reservada para el único estado que cuesta plata: *generando cargo*.

**Ningún botón común es rojo.** Si lo fuera, el cilindro que ya genera cargo dejaría de saltar a la vista, y esa es la razón por la que existe la app.

El logo va en `public/logo-gongas.png`. Se usa solo sobre fondo claro: el archivo tiene fondo blanco, así que sobre el encabezado oscuro de Avisos quedaría un recuadro. En la pantalla de inicio va arriba a la izquierda, 22 px de alto, con el título debajo.

---

## 2. Tokens

Reemplazar el bloque `@theme` de `src/index.css` por este:

```css
@theme {
  /* Marca */
  --color-marca: #1C2D5F;
  --color-marca-tinta: #142145;
  --color-marca-suave: #E9ECF5;
  --color-marca-clara: #A9B4D0;
  --color-rojo-marca: #CE2027;

  /* Texto y superficies */
  --color-tinta: #0C1116;
  --color-tinta-2: #56636D;
  --color-tinta-3: #5E6A74;
  --color-fondo: #F3F5F7;
  --color-linea: #E2E7EB;
  --color-linea-fuerte: #CDD5DC;

  /* Los cuatro estados del cilindro */
  --color-stock: #46525B;
  --color-stock-suave: #EEF1F3;
  --color-stock-borde: #CDD5DC;

  --color-gracia: #0B5A4D;
  --color-gracia-suave: #E4F2EE;
  --color-gracia-borde: #0D6E5E;

  --color-vencer: #8A5200;
  --color-vencer-suave: #FBEED7;
  --color-vencer-borde: #D79A28;

  --color-cargo: #A81D24;
  --color-cargo-suave: #FBE9EA;
  --color-cargo-borde: #A81D24;

  /* Tipografía */
  --font-titulo: 'Space Grotesk', system-ui, sans-serif;
  --font-cuerpo: 'Inter', system-ui, sans-serif;
  --font-serie: 'JetBrains Mono', ui-monospace, monospace;
}
```

El `body` queda en `background: var(--color-fondo)` y `color: var(--color-tinta)`.

Todos los pares de texto sobre fondo de esta tabla pasan 4.5:1. **No aclarar ninguno.** En particular `--color-tinta-3` es el gris mínimo aceptable para los textos de 11 px de la navegación; cualquier cosa más clara falla.

---

## 3. Tipografía

Tres familias, cada una con un trabajo. Cargar en `index.html`, en el `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
```

| Familia | Dónde | Por qué |
| --- | --- | --- |
| **Space Grotesk** 700 | Títulos de pantalla, importes grandes, contador del lote, texto de botones principales | Numerales de carácter, se lee de lejos |
| **Inter** 400/500/600/700 | Todo lo demás. Base 16 px, interlineado 1.5 | Rinde bien en tamaños chicos |
| **JetBrains Mono** 700 | **Solo series de cilindro** | Cero con barra: evita confundir `CIL-00105` con `CIL-OO105` cuando alguien la lee en voz alta frente al tubo |

Escala: título de pantalla 29 px, importe hero 42–46 px, contador del lote 52 px, cuerpo 15–16 px, secundario 13.5 px, etiqueta de navegación 11 px. Nunca por debajo de 11 px.

Todo número que se compara lleva `font-variant-numeric: tabular-nums`.

---

## 4. Componentes

### Botones

| Tipo | Alto | Estilo |
| --- | --- | --- |
| Principal (Confirmar lote, Avisar) | 56–60 px | `bg-tinta` relleno, texto blanco, `rounded-[15px]`, Space Grotesk 700 |
| Entregar | 132 px (tarjeta) | `bg-marca` relleno, texto blanco |
| Recibir | 132 px (tarjeta) | Blanco con borde `2px` `--color-tinta` |
| Secundario | 50 px | Blanco, borde `1.5px` `--color-linea-fuerte` |
| Chip de filtro | 36 px | Activo: `bg-tinta` relleno blanco. Inactivo: blanco con borde |

Mínimo absoluto de cualquier objetivo táctil: **44 px**. Las acciones principales van a 56.

**Entregar y Recibir se distinguen por relleno, no solo por color**: uno sólido, el otro contorno, con flechas en sentido opuesto. Es el error más caro de la app: si el operador se equivoca de modo, veinte cilindros entran al movimiento contrario.

### Chip de estado

Cada estado lleva **icono + color + barra lateral de distinta claridad**. Quien no distingue rojo de verde los sigue separando por forma.

| Estado | Rango | Icono | Fondo / texto | Barra de fila |
| --- | --- | --- | --- | --- |
| En stock | sin arriendo | caja | `--color-stock-suave` / `--color-stock` | `--color-stock-borde` |
| En gracia | día 1 a 53 | tilde | `--color-gracia-suave` / `--color-gracia` | `--color-gracia-borde` |
| Por vencer | día 54 a 60 | reloj | `--color-vencer-suave` / `--color-vencer` | `--color-vencer-borde` |
| Generando cargo | día 61+ | triángulo de alerta | `--color-cargo-suave` / `--color-cargo` | `--color-cargo-borde` |

Chip: alto 25 px, `rounded-full`, padding horizontal 10 px, 12 px bold, icono de 12 px.

Iconos: SVG en línea, trazo 2–2.6, `stroke-linecap="round"`. Nunca emoji. Los decorativos llevan `aria-hidden="true"`; los botones de solo icono llevan `aria-label`.

### Fila de cilindro

Barra lateral de 3 px del color del estado, luego:

- Línea 1: **serie** en JetBrains Mono 17 px bold (lo más grande de la fila) + chip de estado a la derecha.
- Línea 2: `Tamaño · Dónde · N días` en 13.5 px `--color-tinta-2` + importe a la derecha en 16 px bold.
- El importe va en `--color-cargo` si es mayor que cero, y en `--color-tinta-2` si es cero.
- En stock no se muestra importe. Tampoco si `tarifaMensual` es `null`.

### Encabezado de pantalla

Fondo blanco, borde inferior `--color-linea`, título Space Grotesk 29 px. Buscador y filtros van dentro del encabezado, no flotando sobre la lista.

Excepción: **Avisos** usa encabezado `--color-tinta` con el total en blanco, y **Resumen** usa una tarjeta `--color-marca` con el total.

### Navegación inferior

Cinco ítems, que es el máximo. Alto 62 px más `env(safe-area-inset-bottom)`. Activo en `--color-marca` con etiqueta en 700; inactivo en `--color-tinta-3` con etiqueta en 500. Avisos lleva un globo rojo con la cantidad cuando hay algo que cobrar.

### Radios y espaciado

Botones 15 px · tarjetas y listas 16 px · chips 999 px · iconos contenidos 9–15 px. Escala de espaciado de 4: 8, 12, 14, 16, 20, 24.

---

## 5. Cambios respecto de lo que ya está hecho

Esto es lo que hay que tocar en las pantallas que ya existen:

1. **`PantallaAvisos`** — agregar un encabezado oscuro con el **total acumulado** en Space Grotesk 46 px, arriba de la lista. Hoy el importe es un número chico a la derecha de cada fila. Joaquín no entra a esa pantalla a leer una lista, entra a ver cuánto hay para cobrar.
2. **`PantallaResumen`** — misma idea: tarjeta azul con el total arriba, y fila de Total al pie de la tabla.
3. **`ChipEstado`** — agregarle icono a cada estado y separar `stock` de `en_gracia` con colores propios. Hoy los dos son neutros.
4. **Filas de `PantallaCilindros`** — agregar la barra lateral de 3 px por estado.
5. **`PantallaEscaneo`** — el contador del lote va a 52 px, legible con el brazo estirado, porque el teléfono está lejos de los ojos mientras se escanea.
6. **`NavegacionInferior`** — activo pasa de `slate-900` a `--color-marca`, inactivo de `slate-400` a `--color-tinta-3`, y Avisos gana el globo con la cantidad.
7. **`Encabezado`** de la pantalla de inicio — el logo reemplaza al texto "GONGAS".

---

## 6. Reglas que no se negocian

- **La serie manda.** En toda lista de cilindros, la serie es el elemento más grande de la fila. Es lo que la gente busca y lo que lee en voz alta.
- **La plata va arriba.** Avisos y Resumen abren con el total, no con la lista.
- **Avisar, no bloquear.** Un cilindro que figura en otro cliente se escanea igual, con alerta ámbar. Manda la realidad del depósito, no lo que dice la base.
- **Ningún estado se distingue solo por color.** Siempre icono y forma además del color.
- **Nada por debajo de 44 px** de área táctil, ni de 11 px de texto.
- Elementos reales: `<button>`, `<a href>`, `<input>` con `<label>`. Nunca un `div` con `onClick`, porque el teclado lo saltea.

---

## 7. Checklist antes de dar por hecha una pantalla

- [ ] Se usa entera con una sola mano, sin zoom, en 390 px de ancho.
- [ ] Ningún texto por debajo de 4.5:1 sobre su fondo.
- [ ] Todo objetivo táctil mide 44 px o más.
- [ ] Los estados se distinguen con la pantalla en blanco y negro.
- [ ] Los números que se comparan están en `tabular-nums` y alineados a la derecha.
- [ ] Los botones de solo icono tienen `aria-label`.
- [ ] No hay scroll horizontal.
