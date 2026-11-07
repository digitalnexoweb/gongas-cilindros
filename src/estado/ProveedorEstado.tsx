import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { hoyISO, type FechaISO } from '../dominio/arriendo';
import { almacenLocalStorage, grabarEstado, inicializar } from '../dominio/storage';
import type { EstadoApp } from '../dominio/tipos';

type ContextoEstado = {
  estado: EstadoApp;
  /** El mismo "hoy" para toda la app. Se calcula una sola vez al abrirla. */
  hoy: FechaISO;
  /** Graba en localStorage y re-renderiza. La usa el punto 4. */
  actualizar(nuevo: EstadoApp): void;
};

const Contexto = createContext<ContextoEstado | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  // El "hoy" queda congelado al abrir: toda la pantalla cuenta los días contra
  // la misma fecha, igual que el dominio, que lo recibe siempre desde afuera.
  const [hoy] = useState<FechaISO>(() => hoyISO());

  // En el inicializador, no en un useEffect: así la demo ya está sembrada en el
  // primer render y no se ve un parpadeo con la lista vacía.
  const [estado, setEstado] = useState<EstadoApp>(() => inicializar(almacenLocalStorage, hoy));

  const actualizar = useCallback((nuevo: EstadoApp) => {
    grabarEstado(almacenLocalStorage, nuevo);
    setEstado(nuevo);
  }, []);

  return <Contexto.Provider value={{ estado, hoy, actualizar }}>{children}</Contexto.Provider>;
}

export function useEstado(): ContextoEstado {
  const valor = useContext(Contexto);
  if (valor === null) throw new Error('useEstado tiene que estar dentro de ProveedorEstado.');
  return valor;
}
