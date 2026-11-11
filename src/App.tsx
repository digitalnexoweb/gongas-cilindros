import { useCallback, useEffect, useMemo, useState } from 'react';

import { ProveedorEstado, useEstado, useSesion } from './estado/ProveedorEstado';
import { paraCobrar } from './ui/paraCobrar';
import { CuentaDesactivada } from './ui/CuentaDesactivada';
import { NavegacionInferior, type Pestana } from './ui/NavegacionInferior';
import { FichaCilindro } from './ui/pantallas/FichaCilindro';
import { FichaCliente } from './ui/pantallas/FichaCliente';
import { PantallaAjustes } from './ui/pantallas/PantallaAjustes';
import { PantallaAvisos } from './ui/pantallas/PantallaAvisos';
import { PantallaCilindros } from './ui/pantallas/PantallaCilindros';
import { PantallaClientes } from './ui/pantallas/PantallaClientes';
import { PantallaEscaneo } from './ui/pantallas/PantallaEscaneo';
import { PantallaEtiquetas } from './ui/pantallas/PantallaEtiquetas';
import { PantallaIngreso } from './ui/pantallas/PantallaIngreso';
import { PantallaResumen } from './ui/pantallas/PantallaResumen';
import { PantallaTarifas } from './ui/pantallas/PantallaTarifas';
import { PantallaTextoAviso } from './ui/pantallas/PantallaTextoAviso';
import { PantallaTiposGas } from './ui/pantallas/PantallaTiposGas';
import { PantallaCambiarClave } from './ui/pantallas/PantallaCambiarClave';
import { PantallaNuevaClave } from './ui/pantallas/PantallaNuevaClave';
import { PantallaUsuarios } from './ui/pantallas/PantallaUsuarios';

/**
 * Lo que se apila encima de la pestaña actual. Es una pila, así que Ajustes
 * puede abrir Etiquetas y el botón atrás las cierra de a una.
 */
type Capa =
  | { tipo: 'cilindro'; id: string }
  | { tipo: 'cliente'; id: string }
  | { tipo: 'ajustes' }
  | { tipo: 'etiquetas' }
  | { tipo: 'usuarios' }
  | { tipo: 'tarifas' }
  | { tipo: 'texto-aviso' }
  | { tipo: 'tipos-gas' }
  | { tipo: 'cambiar-clave' };

export function App() {
  return (
    <ProveedorEstado>
      <Portones />
    </ProveedorEstado>
  );
}

/** Qué se muestra según en qué está la sesión. La app solo aparece con todo listo. */
function Portones() {
  const { sesion, reintentar, cerrarSesion, eligiendoNuevaClave, elegirNuevaClave } = useSesion();

  // Abrieron la app desde el link de "me olvidé la contraseña": antes que nada, la nueva.
  if (eligiendoNuevaClave) return <PantallaNuevaClave alGuardar={elegirNuevaClave} />;

  switch (sesion.fase) {
    case 'cargando':
      return (
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-slate-500">Cargando…</p>
        </div>
      );

    case 'sin_sesion':
      return <PantallaIngreso />;

    case 'desactivada':
      return <CuentaDesactivada nombre={sesion.nombre} />;

    case 'error':
      return (
        <div className="flex min-h-dvh flex-col justify-center gap-6 px-6 pb-16">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">No se pudieron cargar los datos</h1>
            <p className="mt-2 text-slate-500">{sesion.mensaje}</p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={reintentar}
              className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => void cerrarSesion()}
              className="h-14 w-full rounded-xl border border-slate-300 text-base font-semibold active:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      );

    case 'lista':
      return <Armazon />;
  }
}

function Armazon() {
  const { estado, hoy } = useEstado();
  const enCargo = useMemo(() => paraCobrar(estado, hoy).cantidad, [estado, hoy]);

  // Escanear es la pantalla de inicio, como dice la sección 6.1.
  const [pestana, setPestana] = useState<Pestana>('escanear');
  const [capas, setCapas] = useState<Capa[]>([]);
  // Mientras se escanea un lote, y en su comprobante, no hay barra de navegación.
  const [enFlujo, setEnFlujo] = useState(false);

  // El botón atrás de Android saca una capa en vez de salir de la app.
  useEffect(() => {
    function alVolverAtras() {
      setCapas((xs) => xs.slice(0, -1));
    }

    window.addEventListener('popstate', alVolverAtras);
    return () => window.removeEventListener('popstate', alVolverAtras);
  }, []);

  // Al cambiar de pantalla se arranca desde arriba: si no, la ficha hereda el
  // scroll de la lista y aparece con el primer bloque cortado.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pestana, capas.length]);

  const abrir = useCallback((capa: Capa) => {
    window.history.pushState({ capa: true }, '');
    setCapas((xs) => [...xs, capa]);
  }, []);

  const cerrar = useCallback(() => {
    // Volver dispara popstate, y ese listener es el que saca la capa.
    if (window.history.state?.capa === true) window.history.back();
    else setCapas((xs) => xs.slice(0, -1));
  }, []);

  // Cambiar de pestaña cierra las capas y no apila historia.
  const irA = useCallback((siguiente: Pestana) => {
    setCapas([]);
    setPestana(siguiente);
  }, []);

  const capa = capas.at(-1) ?? null;
  const conNavegacion = !(enFlujo && capa === null && pestana === 'escanear');

  return (
    <div className={`min-h-dvh ${conNavegacion ? 'pb-20' : ''}`}>
      {capa === null && (
        <>
          {pestana === 'escanear' && (
            <PantallaEscaneo
              alAbrirAjustes={() => abrir({ tipo: 'ajustes' })}
              alIrAAvisos={() => irA('avisos')}
              alCambiarFlujo={setEnFlujo}
            />
          )}
          {pestana === 'cilindros' && (
            <PantallaCilindros alAbrir={(id) => abrir({ tipo: 'cilindro', id })} />
          )}
          {pestana === 'clientes' && (
            <PantallaClientes alAbrir={(id) => abrir({ tipo: 'cliente', id })} />
          )}
          {pestana === 'avisos' && <PantallaAvisos />}
          {pestana === 'resumen' && <PantallaResumen />}
        </>
      )}

      {capa?.tipo === 'cilindro' && <FichaCilindro cilindroId={capa.id} alVolver={cerrar} />}
      {capa?.tipo === 'cliente' && <FichaCliente clienteId={capa.id} alVolver={cerrar} />}
      {capa?.tipo === 'ajustes' && (
        <PantallaAjustes
          alVolver={cerrar}
          alAbrirEtiquetas={() => abrir({ tipo: 'etiquetas' })}
          alAbrirUsuarios={() => abrir({ tipo: 'usuarios' })}
          alAbrirTarifas={() => abrir({ tipo: 'tarifas' })}
          alAbrirTextoAviso={() => abrir({ tipo: 'texto-aviso' })}
          alAbrirTiposGas={() => abrir({ tipo: 'tipos-gas' })}
          alAbrirCambiarClave={() => abrir({ tipo: 'cambiar-clave' })}
        />
      )}
      {capa?.tipo === 'texto-aviso' && <PantallaTextoAviso alVolver={cerrar} />}
      {capa?.tipo === 'tipos-gas' && <PantallaTiposGas alVolver={cerrar} />}
      {capa?.tipo === 'cambiar-clave' && <PantallaCambiarClave alVolver={cerrar} />}
      {capa?.tipo === 'etiquetas' && <PantallaEtiquetas alVolver={cerrar} />}
      {capa?.tipo === 'usuarios' && <PantallaUsuarios alVolver={cerrar} />}
      {capa?.tipo === 'tarifas' && <PantallaTarifas alVolver={cerrar} />}

      {conNavegacion && <NavegacionInferior activa={pestana} alElegir={irA} enCargo={enCargo} />}
    </div>
  );
}
