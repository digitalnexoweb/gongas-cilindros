import { useCallback, useEffect, useState } from 'react';

import { ProveedorEstado, useEstado } from './estado/ProveedorEstado';
import { NavegacionInferior, type Pestana } from './ui/NavegacionInferior';
import { PedirOperador } from './ui/PedirOperador';
import { FichaCilindro } from './ui/pantallas/FichaCilindro';
import { FichaCliente } from './ui/pantallas/FichaCliente';
import { PantallaAjustes } from './ui/pantallas/PantallaAjustes';
import { PantallaAvisos } from './ui/pantallas/PantallaAvisos';
import { PantallaCilindros } from './ui/pantallas/PantallaCilindros';
import { PantallaClientes } from './ui/pantallas/PantallaClientes';
import { PantallaEscaneo } from './ui/pantallas/PantallaEscaneo';
import { PantallaEtiquetas } from './ui/pantallas/PantallaEtiquetas';
import { PantallaResumen } from './ui/pantallas/PantallaResumen';

/**
 * Lo que se apila encima de la pestaña actual. Es una pila, así que Ajustes
 * puede abrir Etiquetas y el botón atrás las cierra de a una.
 */
type Capa =
  | { tipo: 'cilindro'; id: string }
  | { tipo: 'cliente'; id: string }
  | { tipo: 'ajustes' }
  | { tipo: 'etiquetas' };

export function App() {
  return (
    <ProveedorEstado>
      <Armazon />
    </ProveedorEstado>
  );
}

function Armazon() {
  const { estado, actualizar } = useEstado();

  // Escanear es la pantalla de inicio, como dice la sección 6.1.
  const [pestana, setPestana] = useState<Pestana>('escanear');
  const [capas, setCapas] = useState<Capa[]>([]);

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

  // "El nombre elegido al abrir la app", de la sección 4. Una sola vez.
  if (estado.operador.trim() === '') {
    return <PedirOperador alElegir={(nombre) => actualizar({ ...estado, operador: nombre })} />;
  }

  const capa = capas.at(-1) ?? null;

  return (
    <div className="min-h-dvh pb-20">
      {capa === null && (
        <>
          {pestana === 'escanear' && (
            <PantallaEscaneo alAbrirAjustes={() => abrir({ tipo: 'ajustes' })} />
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
        />
      )}
      {capa?.tipo === 'etiquetas' && <PantallaEtiquetas alVolver={cerrar} />}

      <NavegacionInferior activa={pestana} alElegir={irA} />
    </div>
  );
}
