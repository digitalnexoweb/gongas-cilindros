/**
 * La capa de datos: `localStorage`, la semilla de demo y las escrituras.
 *
 * Lo único que habla con `localStorage` son `leerEstado` y `grabarEstado`, y lo
 * hacen a través de `AlmacenCrudo`. Todo lo demás son funciones puras que reciben
 * un `EstadoApp` y devuelven uno nuevo, sin tocar el original. El día del cambio
 * a Supabase se reemplaza `almacenLocalStorage` y nada más, como pide la sección 3.
 */

import { type FechaISO, sumarDias } from './arriendo';
import {
  TARIFA_POR_TAMANO,
  type Arriendo,
  type Cilindro,
  type Cliente,
  type EstadoApp,
  type Movimiento,
  type TipoMovimiento,
} from './tipos';

/** La versión va en la clave: un celular con datos viejos no revienta, arranca de nuevo. */
export const CLAVE_ALMACEN = 'gongas:v1';

/**
 * Quién hizo los movimientos que vienen sembrados. Es historia, no el operador
 * actual: la sección 4 dice que el operador es "el nombre elegido al abrir la
 * app", así que `EstadoApp.operador` arranca vacío y la app lo pregunta.
 */
const OPERADOR_DE_LA_SEMILLA = 'Joaquín';

// ──────────────────────────────────────────────── El almacén de abajo

/** Lo mínimo que necesita esta capa para guardar texto en algún lado. */
export type AlmacenCrudo = {
  leer(clave: string): string | null;
  escribir(clave: string, valor: string): void;
  borrar(clave: string): void;
};

/** El de producción: el `localStorage` del navegador. */
export const almacenLocalStorage: AlmacenCrudo = {
  leer: (clave) => localStorage.getItem(clave),
  escribir: (clave, valor) => localStorage.setItem(clave, valor),
  borrar: (clave) => localStorage.removeItem(clave),
};

/** Uno en memoria, para los tests y para cuando no haya `localStorage`. */
export function almacenEnMemoria(inicial: Record<string, string> = {}): AlmacenCrudo {
  const datos = new Map(Object.entries(inicial));
  return {
    leer: (clave) => datos.get(clave) ?? null,
    escribir: (clave, valor) => void datos.set(clave, valor),
    borrar: (clave) => void datos.delete(clave),
  };
}

function nuevoId(): string {
  return crypto.randomUUID();
}

// ──────────────────────────────────────────────── Leer y grabar

/** Devuelve `null` si no hay nada guardado, o si lo que hay no se entiende. */
export function leerEstado(almacen: AlmacenCrudo): EstadoApp | null {
  const texto = almacen.leer(CLAVE_ALMACEN);
  if (texto === null) return null;

  try {
    const dato: unknown = JSON.parse(texto);
    return esEstadoApp(dato) ? dato : null;
  } catch {
    // JSON roto. Mejor arrancar de nuevo que reventar la app en la mano del cliente.
    return null;
  }
}

export function grabarEstado(almacen: AlmacenCrudo, estado: EstadoApp): void {
  almacen.escribir(CLAVE_ALMACEN, JSON.stringify(estado));
}

function esEstadoApp(dato: unknown): dato is EstadoApp {
  if (typeof dato !== 'object' || dato === null) return false;
  const e = dato as Partial<EstadoApp>;
  return (
    e.version === 1 &&
    typeof e.operador === 'string' &&
    Array.isArray(e.clientes) &&
    Array.isArray(e.cilindros) &&
    Array.isArray(e.arriendos) &&
    Array.isArray(e.movimientos)
  );
}

/** Lee lo guardado; si no hay nada, siembra la demo y la graba. */
export function inicializar(almacen: AlmacenCrudo, hoy: FechaISO): EstadoApp {
  const guardado = leerEstado(almacen);
  if (guardado !== null) return guardado;

  const semilla = estadoDemo(hoy);
  grabarEstado(almacen, semilla);
  return semilla;
}

/** El botón "Reiniciar demo" de Ajustes: pisa todo con la semilla. */
export function reiniciarDemo(almacen: AlmacenCrudo, hoy: FechaISO): EstadoApp {
  const semilla = estadoDemo(hoy);
  grabarEstado(almacen, semilla);
  return semilla;
}

// ──────────────────────────────────────────────── La semilla de la sección 7

type PlanCilindro = {
  id: string;
  serie: string;
  tamano: 'chico' | 'grande';
  /** Cliente donde está, o `null` si está en stock. */
  clienteId: string | null;
  /** Hace cuántos días se entregó. */
  diasDesdeEntrega?: number;
  /** Hace cuántos días se devolvió, para el arriendo ya cerrado. */
  diasDesdeDevolucion?: number;
};

/**
 * Los datos de demo de la sección 7.
 *
 * Las fechas se calculan como `hoy − N días` y **nunca se escriben fijas**, así
 * la demo sigue siendo coherente la semana que viene. Los ids son legibles a
 * propósito, para poder depurar mirando el `localStorage`.
 */
export function estadoDemo(hoy: FechaISO, operador: string = ''): EstadoApp {
  const clientes: Cliente[] = [
    { id: 'cli-ancap',   nombre: 'ANCAP',            tipo: 'empresa',     documento: '211003420017', telefono: '+59899100101' },
    { id: 'cli-armada',  nombre: 'Armada Nacional',  tipo: 'empresa',     documento: '215062160018', telefono: '+59899100102' },
    { id: 'cli-pereira', nombre: 'Taller Pereira',   tipo: 'particular',  documento: '41234567',     telefono: '+59899100103' },
  ];

  const plan: PlanCilindro[] = [
    { id: 'cil-00101', serie: 'CIL-00101', tamano: 'grande', clienteId: 'cli-ancap',   diasDesdeEntrega: 92 },
    { id: 'cil-00102', serie: 'CIL-00102', tamano: 'grande', clienteId: 'cli-ancap',   diasDesdeEntrega: 75 },
    { id: 'cil-00103', serie: 'CIL-00103', tamano: 'chico',  clienteId: 'cli-armada',  diasDesdeEntrega: 58 },
    { id: 'cil-00104', serie: 'CIL-00104', tamano: 'chico',  clienteId: 'cli-pereira', diasDesdeEntrega: 20 },
    { id: 'cil-00105', serie: 'CIL-00105', tamano: 'grande', clienteId: null },
    { id: 'cil-00106', serie: 'CIL-00106', tamano: 'chico',  clienteId: null },
    // Devuelto hace 10 días: queda en stock, pero con historial y un arriendo cerrado.
    { id: 'cil-00107', serie: 'CIL-00107', tamano: 'chico',  clienteId: 'cli-pereira', diasDesdeEntrega: 80, diasDesdeDevolucion: 10 },
  ];

  const cilindros: Cilindro[] = plan.map((p) => ({
    id: p.id,
    serie: p.serie,
    tipoGas: 'acetileno',
    tamano: p.tamano,
    tarifaMensual: TARIFA_POR_TAMANO[p.tamano],
    activo: true,
  }));

  const arriendos: Arriendo[] = [];
  const movimientos: Movimiento[] = [];
  let lote = 0;

  for (const p of plan) {
    if (p.clienteId === null || p.diasDesdeEntrega === undefined) continue;

    lote += 1;
    const loteId = `lote-demo-${lote}`;
    const fechaEntrega = sumarDias(hoy, -p.diasDesdeEntrega);
    const fechaDevolucion =
      p.diasDesdeDevolucion === undefined ? null : sumarDias(hoy, -p.diasDesdeDevolucion);

    arriendos.push({
      id: `arr-${p.id}`,
      cilindroId: p.id,
      clienteId: p.clienteId,
      fechaEntrega,
      fechaDevolucion,
    });

    movimientos.push({
      id: `mov-${p.id}-entrega`,
      tipo: 'entrega',
      cilindroId: p.id,
      clienteId: p.clienteId,
      fecha: fechaEntrega,
      loteId,
      operador: OPERADOR_DE_LA_SEMILLA,
    });

    if (fechaDevolucion !== null) {
      movimientos.push({
        id: `mov-${p.id}-devolucion`,
        tipo: 'devolucion',
        cilindroId: p.id,
        clienteId: p.clienteId,
        fecha: fechaDevolucion,
        loteId: `lote-demo-${(lote += 1)}`,
        operador: OPERADOR_DE_LA_SEMILLA,
      });
    }
  }

  // Del más viejo al más nuevo, como pasó en la realidad.
  movimientos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  return { version: 1, operador, clientes, cilindros, arriendos, movimientos };
}

// ──────────────────────────────────────────────── Altas

export function altaCliente(
  estado: EstadoApp,
  datos: Omit<Cliente, 'id'>,
): { estado: EstadoApp; cliente: Cliente } {
  const cliente: Cliente = { id: nuevoId(), ...datos };
  return { estado: { ...estado, clientes: [...estado.clientes, cliente] }, cliente };
}

export function altaCilindro(
  estado: EstadoApp,
  datos: Omit<Cilindro, 'id' | 'tarifaMensual' | 'activo'> &
    Partial<Pick<Cilindro, 'tarifaMensual' | 'activo'>>,
): { estado: EstadoApp; cilindro: Cilindro } {
  const cilindro: Cilindro = {
    id: nuevoId(),
    serie: datos.serie,
    tipoGas: datos.tipoGas,
    tamano: datos.tamano,
    tarifaMensual: datos.tarifaMensual ?? TARIFA_POR_TAMANO[datos.tamano],
    activo: datos.activo ?? true,
  };
  return { estado: { ...estado, cilindros: [...estado.cilindros, cilindro] }, cilindro };
}

// ──────────────────────────────────────────────── Confirmar un lote

export type TipoAviso =
  | 'serie_repetida'
  | 'serie_desconocida'
  | 'ya_en_otro_cliente'
  | 'ya_en_este_cliente'
  | 'ya_en_stock';

export type AvisoLote = {
  serie: string;
  tipo: TipoAviso;
  mensaje: string;
};

export type OrdenLote = {
  tipo: TipoMovimiento;
  series: string[];
  /** Obligatorio en las entregas; se ignora en las devoluciones. */
  clienteId: string | null;
  operador: string;
  fecha: FechaISO;
  /** Se genera uno si no viene. */
  loteId?: string;
};

export type ResultadoLote = {
  estado: EstadoApp;
  loteId: string;
  /** Solo los movimientos que grabó este lote. */
  movimientos: Movimiento[];
  /** Las validaciones de 6.1: avisan, no bloquean. */
  avisos: AvisoLote[];
};

function arriendoAbierto(arriendos: Arriendo[], cilindroId: string): Arriendo | undefined {
  return arriendos.find((a) => a.cilindroId === cilindroId && a.fechaDevolucion === null);
}

/**
 * Graba los movimientos y abre o cierra los arriendos **en la misma operación**.
 * Eso es lo que sostiene la regla de la sección 4: si las dos cosas no se
 * escriben juntas, la ubicación deja de ser deducible.
 *
 * Los movimientos solo se agregan. Nunca se editan ni se borran.
 */
export function confirmarLote(estado: EstadoApp, orden: OrdenLote): ResultadoLote {
  if (orden.tipo === 'entrega' && orden.clienteId === null) {
    // No es una validación de 6.1, es un error de programación: la pantalla de
    // escaneo elige el cliente antes de abrir la cámara.
    throw new Error('Una entrega necesita un cliente.');
  }

  const loteId = orden.loteId ?? nuevoId();
  const avisos: AvisoLote[] = [];
  const movimientosNuevos: Movimiento[] = [];
  const yaVistas = new Set<string>();

  let arriendos = [...estado.arriendos];

  for (const serie of orden.series) {
    if (yaVistas.has(serie)) {
      avisos.push({
        serie,
        tipo: 'serie_repetida',
        mensaje: `${serie} estaba repetida en el lote. Se tomó una sola vez.`,
      });
      continue;
    }
    yaVistas.add(serie);

    const cilindro = estado.cilindros.find((c) => c.serie === serie);
    if (cilindro === undefined) {
      avisos.push({
        serie,
        tipo: 'serie_desconocida',
        mensaje: `${serie} no está en el sistema. Hay que darla de alta.`,
      });
      continue;
    }

    const abierto = arriendoAbierto(arriendos, cilindro.id);

    if (orden.tipo === 'entrega') {
      const clienteId = orden.clienteId as string;

      if (abierto !== undefined && abierto.clienteId === clienteId) {
        // Ya estaba en este mismo cliente. Se avisa y NO se toca el arriendo:
        // cerrarlo y abrir otro pondría el reloj en cero y borraría lo acumulado.
        avisos.push({
          serie,
          tipo: 'ya_en_este_cliente',
          mensaje: `${serie} ya figuraba en este cliente. El reloj sigue desde la entrega original.`,
        });
      } else {
        if (abierto !== undefined) {
          avisos.push({
            serie,
            tipo: 'ya_en_otro_cliente',
            mensaje: `${serie} figuraba en otro cliente. Se cerró ese arriendo y se abrió el nuevo.`,
          });
          arriendos = arriendos.map((a) =>
            a.id === abierto.id ? { ...a, fechaDevolucion: orden.fecha } : a,
          );
        }

        arriendos = [
          ...arriendos,
          {
            id: nuevoId(),
            cilindroId: cilindro.id,
            clienteId,
            fechaEntrega: orden.fecha,
            fechaDevolucion: null,
          },
        ];
      }

      movimientosNuevos.push({
        id: nuevoId(),
        tipo: 'entrega',
        cilindroId: cilindro.id,
        clienteId,
        fecha: orden.fecha,
        loteId,
        operador: orden.operador,
      });
      continue;
    }

    // Devolución.
    if (abierto === undefined) {
      avisos.push({
        serie,
        tipo: 'ya_en_stock',
        mensaje: `${serie} ya figuraba en stock. Se registró el movimiento igual.`,
      });
    } else {
      arriendos = arriendos.map((a) =>
        a.id === abierto.id ? { ...a, fechaDevolucion: orden.fecha } : a,
      );
    }

    movimientosNuevos.push({
      id: nuevoId(),
      tipo: 'devolucion',
      cilindroId: cilindro.id,
      clienteId: abierto?.clienteId ?? null,
      fecha: orden.fecha,
      loteId,
      operador: orden.operador,
    });
  }

  return {
    estado: {
      ...estado,
      arriendos,
      movimientos: [...estado.movimientos, ...movimientosNuevos],
    },
    loteId,
    movimientos: movimientosNuevos,
    avisos,
  };
}
