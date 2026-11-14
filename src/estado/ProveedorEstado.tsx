import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as repositorio from '../datos/repositorio';
import type { LoteConfirmado } from '../datos/repositorio';
import type { Perfil } from '../datos/filas';
import { hoyISO, type FechaISO } from '../dominio/arriendo';
import type { Cliente, EstadoApp, TextosAviso, TipoMovimiento } from '../dominio/tipos';

/**
 * La sesión y la foto del estado.
 *
 * Antes la foto salía de `localStorage`, al instante y sin fallar. Ahora sale
 * de la base: hay que saber quién está conectado, esperar la carga, y volver a
 * cargar cuando otra persona escribe.
 */

export type Sesion =
  | { fase: 'cargando' }
  | { fase: 'sin_sesion' }
  /** Hay cuenta, pero un administrador todavía no la activó, o la desactivó. */
  | { fase: 'desactivada'; nombre: string | null }
  | { fase: 'error'; mensaje: string }
  | { fase: 'lista'; perfil: Perfil; estado: EstadoApp };

type ContextoSesion = {
  sesion: Sesion;
  ingresar(mail: string, clave: string): Promise<void>;
  /**
   * La cuenta nace desactivada; la sesión queda abierta y muestra eso. `false`
   * si Supabase pide confirmar el mail primero.
   */
  crearCuenta(nombre: string, mail: string, clave: string): Promise<boolean>;
  cerrarSesion(): Promise<void>;
  reintentar(): void;
  /** Manda el mail con el link para elegir una contraseña nueva. */
  pedirNuevaClave(mail: string): Promise<void>;
  /**
   * `true` mientras se viene del link de "me olvidé la contraseña": la app
   * tiene que pedir la nueva antes de cualquier otra cosa.
   */
  eligiendoNuevaClave: boolean;
  elegirNuevaClave(nueva: string): Promise<void>;
};

type ContextoEstado = {
  estado: EstadoApp;
  perfil: Perfil;
  /** Solo el administrador. A los demás la base no les entrega tarifas. */
  puedeVerPlata: boolean;
  /** El mismo "hoy" para toda la app, según el reloj del dispositivo. */
  hoy: FechaISO;
  recargar(): Promise<void>;
  /** Graba el lote en la base y recarga. Si falla, tira y no cambia nada. */
  confirmarLote(
    tipo: TipoMovimiento,
    series: string[],
    clienteId: string | null,
    /** El gas de cada serie, en el mismo orden. Solo en las entregas. */
    gases?: (string | null)[],
  ): Promise<LoteConfirmado>;
  /**
   * Deshace esos movimientos, todo o nada, y recarga. Si la base rechaza
   * alguno, tira con el motivo y no cambia nada.
   */
  deshacerMovimientos(ids: string[]): Promise<void>;
  /** Borra del todo movimientos ya deshechos, y recarga. */
  borrarDeshechos(ids: string[]): Promise<void>;
  /** Solo el administrador, y solo un cliente sin historia real. Recarga. */
  borrarCliente(id: string): Promise<void>;
  /** Solo el administrador, y solo un cilindro sin historia real. Recarga. */
  borrarCilindro(id: string): Promise<void>;
  /** Da de alta un cliente, recarga y devuelve su id. */
  altaCliente(datos: Omit<Cliente, 'id'>): Promise<string>;
  altaCilindro(serie: string, kg: number, tipoGas?: string): Promise<void>;
  /** Cualquier usuario activo: es un dato físico del cilindro. */
  corregirKilos(serie: string, kg: number): Promise<void>;
  /** Solo el administrador. */
  agregarTipoGas(nombre: string, orden: number): Promise<void>;
  cambiarTipoGas(nombre: string, activo: boolean): Promise<void>;
  /** Solo el administrador; la base lo rechaza para los demás. Recargan al terminar. */
  editarCliente(id: string, datos: Omit<Cliente, 'id'>): Promise<void>;
  editarCilindro(id: string, cambios: repositorio.CambiosCilindro): Promise<void>;
  cambiarTarifaDeKilos(kg: number, tarifa: number): Promise<number>;
  agregarKilos(kg: number, tarifa: number): Promise<void>;
  /** Cualquier usuario activo. Recarga para que la fila muestre el aviso. */
  registrarAviso(arriendoId: string): Promise<void>;
  /** Solo el administrador. */
  guardarTextosAviso(textos: TextosAviso): Promise<void>;
};

const ContextoDeSesion = createContext<ContextoSesion | null>(null);
const ContextoDeEstado = createContext<ContextoEstado | null>(null);

/** Cuánto se espera para juntar varios avisos de la base en una sola recarga. */
const MS_PARA_JUNTAR_CAMBIOS = 200;

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Algo salió mal. Probá de nuevo.';
}

export function ProveedorEstado({ children }: { children: ReactNode }) {
  // `undefined` es "todavía no sé si hay sesión"; `null` es "no hay".
  const [usuarioId, setUsuarioId] = useState<string | null | undefined>(undefined);
  const [sesion, setSesion] = useState<Sesion>({ fase: 'cargando' });
  const [hoy, setHoy] = useState<FechaISO>(() => hoyISO());
  const [intento, setIntento] = useState(0);
  const [eligiendoNuevaClave, setEligiendoNuevaClave] = useState(false);

  // ── Si se abrió la app desde el link de "me olvidé la contraseña".
  useEffect(() => repositorio.alVolverDelLinkDeClave(() => setEligiendoNuevaClave(true)), []);

  // Si llegan dos cargas cruzadas, vale la que se pidió última.
  const turno = useRef(0);

  // ── Quién está conectado en este dispositivo.
  useEffect(() => {
    let vivo = true;

    void repositorio.usuarioConSesion().then((id) => {
      if (vivo) setUsuarioId(id);
    });
    const dejarDeEscuchar = repositorio.alCambiarLaSesion((id) => setUsuarioId(id));

    return () => {
      vivo = false;
      dejarDeEscuchar();
    };
  }, []);

  /**
   * Trae el perfil y la foto. En silencio, si falla se queda con lo que ya
   * había en pantalla: una recarga de fondo no debe tapar el trabajo con un error.
   */
  const cargar = useCallback(async (id: string, enSilencio: boolean) => {
    const miTurno = ++turno.current;

    try {
      const perfil = await repositorio.cargarPerfil(id);
      if (miTurno !== turno.current) return;

      if (perfil === null || !perfil.activo) {
        setSesion({ fase: 'desactivada', nombre: perfil?.nombre ?? null });
        return;
      }

      const estado = await repositorio.cargarEstado(perfil);
      if (miTurno !== turno.current) return;

      setSesion({ fase: 'lista', perfil, estado });
    } catch (error) {
      if (miTurno !== turno.current || enSilencio) return;
      setSesion({ fase: 'error', mensaje: mensajeDe(error) });
    }
  }, []);

  // ── Cargar al entrar, y cada vez que cambia quién está conectado.
  useEffect(() => {
    if (usuarioId === undefined) return;

    if (usuarioId === null) {
      turno.current += 1;
      setSesion({ fase: 'sin_sesion' });
      return;
    }

    setSesion({ fase: 'cargando' });
    void cargar(usuarioId, false);
  }, [usuarioId, intento, cargar]);

  // ── Lo que escribe otro se ve acá sin recargar.
  useEffect(() => {
    if (usuarioId === undefined || usuarioId === null) return;

    let espera: number | null = null;

    const dejarDeEscuchar = repositorio.suscribirCambios(() => {
      // Un lote de cinco cilindros dispara diez avisos: se juntan en una recarga.
      if (espera !== null) window.clearTimeout(espera);
      espera = window.setTimeout(() => void cargar(usuarioId, true), MS_PARA_JUNTAR_CAMBIOS);
    });

    return () => {
      if (espera !== null) window.clearTimeout(espera);
      dejarDeEscuchar();
    };
  }, [usuarioId, cargar]);

  // ── Al volver a la app: el día puede haber cambiado y pudo perderse un aviso.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      setHoy(hoyISO());
      if (typeof usuarioId === 'string') void cargar(usuarioId, true);
    }

    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [usuarioId, cargar]);

  const recargar = useCallback(async () => {
    if (typeof usuarioId === 'string') await cargar(usuarioId, true);
  }, [usuarioId, cargar]);

  const valorDeSesion = useMemo<ContextoSesion>(
    () => ({
      sesion,
      ingresar: repositorio.ingresar,
      crearCuenta: repositorio.crearCuenta,
      cerrarSesion: repositorio.cerrarSesion,
      reintentar: () => setIntento((n) => n + 1),
      pedirNuevaClave: repositorio.pedirNuevaClave,
      eligiendoNuevaClave,
      async elegirNuevaClave(nueva) {
        await repositorio.elegirNuevaClave(nueva);
        setEligiendoNuevaClave(false);
      },
    }),
    [sesion, eligiendoNuevaClave],
  );

  const valorDeEstado = useMemo<ContextoEstado | null>(() => {
    if (sesion.fase !== 'lista') return null;

    return {
      estado: sesion.estado,
      perfil: sesion.perfil,
      puedeVerPlata: sesion.perfil.rol === 'admin',
      hoy,
      recargar,
      async confirmarLote(tipo, series, clienteId, gases) {
        const lote = await repositorio.confirmarLote(tipo, series, clienteId, gases);
        await recargar();
        return lote;
      },
      async deshacerMovimientos(ids) {
        await repositorio.deshacerMovimientos(ids);
        await recargar();
      },
      async borrarDeshechos(ids) {
        await repositorio.borrarDeshechos(ids);
        await recargar();
      },
      async borrarCliente(id) {
        await repositorio.borrarCliente(id);
        await recargar();
      },
      async borrarCilindro(id) {
        await repositorio.borrarCilindro(id);
        await recargar();
      },
      async altaCliente(datos) {
        const id = await repositorio.altaCliente(datos);
        await recargar();
        return id;
      },
      async altaCilindro(serie, kg, tipoGas) {
        await repositorio.altaCilindro(serie, kg, tipoGas);
        await recargar();
      },
      async corregirKilos(serie, kg) {
        await repositorio.corregirKilos(serie, kg);
        await recargar();
      },
      async agregarTipoGas(nombre, orden) {
        await repositorio.agregarTipoGas(nombre, orden);
        await recargar();
      },
      async cambiarTipoGas(nombre, activo) {
        await repositorio.cambiarTipoGas(nombre, activo);
        await recargar();
      },
      async editarCliente(id, datos) {
        await repositorio.editarCliente(id, datos);
        await recargar();
      },
      async editarCilindro(id, cambios) {
        await repositorio.editarCilindro(id, cambios);
        await recargar();
      },
      async cambiarTarifaDeKilos(kg, tarifa) {
        const cambiados = await repositorio.cambiarTarifaDeKilos(kg, tarifa);
        await recargar();
        return cambiados;
      },
      async agregarKilos(kg, tarifa) {
        await repositorio.agregarKilos(kg, tarifa);
        await recargar();
      },
      async registrarAviso(arriendoId) {
        await repositorio.registrarAviso(arriendoId);
        await recargar();
      },
      async guardarTextosAviso(textos) {
        await repositorio.guardarTextosAviso(textos);
        await recargar();
      },
    };
  }, [sesion, hoy, recargar]);

  return (
    <ContextoDeSesion.Provider value={valorDeSesion}>
      <ContextoDeEstado.Provider value={valorDeEstado}>{children}</ContextoDeEstado.Provider>
    </ContextoDeSesion.Provider>
  );
}

export function useSesion(): ContextoSesion {
  const valor = useContext(ContextoDeSesion);
  if (valor === null) throw new Error('useSesion tiene que estar dentro de ProveedorEstado.');
  return valor;
}

/** Solo para las pantallas que se muestran con la sesión lista. */
export function useEstado(): ContextoEstado {
  const valor = useContext(ContextoDeEstado);
  if (valor === null) throw new Error('useEstado solo se puede usar con la sesión iniciada.');
  return valor;
}
