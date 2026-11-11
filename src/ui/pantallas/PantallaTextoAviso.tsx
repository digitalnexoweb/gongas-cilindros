import { useRef, useState } from 'react';

import { DIAS_GRACIA, sumarDias } from '../../dominio/arriendo';
import { HUECOS_AVISO, TEXTOS_AVISO_ORIGINALES, textoDelAviso } from '../../dominio/mensajes';
import type { TextosAviso } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import { Campo, ErrorDeFormulario, claseBotonPrincipal, claseBotonSecundario } from '../Formulario';

const HUECOS_VALIDOS = new Set(HUECOS_AVISO.map((h) => h.hueco));

/** Los huecos que no existen, como "{dia}": quedarían tal cual en el mensaje. */
function huecosDesconocidos(texto: string): string[] {
  return [...new Set(texto.match(/\{\w+\}/g) ?? [])].filter((h) => !HUECOS_VALIDOS.has(h as never));
}

/**
 * El texto genérico de los avisos, para el administrador. Es el mismo para
 * todos los clientes: los huecos entre llaves se completan con los datos de
 * cada uno al momento de avisar.
 */
export function PantallaTextoAviso({ alVolver }: { alVolver(): void }) {
  const { estado, hoy, guardarTextosAviso } = useEstado();
  const guardado = estado.textosAviso ?? TEXTOS_AVISO_ORIGINALES;

  const [textos, setTextos] = useState<TextosAviso>(guardado);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const copiaValida =
    (textos.copiaMail ?? '').trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((textos.copiaMail ?? '').trim());
  const cambiado =
    textos.conCargo !== guardado.conCargo ||
    textos.porVencer !== guardado.porVencer ||
    (textos.copiaMail ?? '') !== (guardado.copiaMail ?? '');
  const vacio = textos.conCargo.trim() === '' || textos.porVencer.trim() === '' || !copiaValida;
  const esOriginal =
    textos.conCargo === TEXTOS_AVISO_ORIGINALES.conCargo &&
    textos.porVencer === TEXTOS_AVISO_ORIGINALES.porVencer;

  function cambiar(cual: keyof TextosAviso, valor: string) {
    setTextos((t) => ({ ...t, [cual]: valor }));
    setHecho(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!cambiado || vacio || guardando) return;

        setGuardando(true);
        setError(null);
        guardarTextosAviso({
          conCargo: textos.conCargo.trim(),
          porVencer: textos.porVencer.trim(),
          copiaMail: (textos.copiaMail ?? '').trim(),
        })
          .then(() => setHecho(true))
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo guardar el texto.');
          })
          .finally(() => setGuardando(false));
      }}
    >
      <Encabezado titulo="Texto del aviso" bajada="El mismo para todos los clientes" alVolver={alVolver} />

      <div className="space-y-6 px-4 pt-4 pb-6">
        <p className="text-sm text-tinta-2">
          Lo que está entre llaves la app lo completa con los datos de cada cliente al avisar. Tocá un
          hueco para agregarlo donde está el cursor.
        </p>
        <p className="text-sm text-tinta-2">
          Es el mismo texto para <strong className="text-tinta">WhatsApp y para el mail automático</strong>.
          El mail sale con el asunto «GONGAS — aviso del cilindro» y la serie.
        </p>

        <EditorDeTexto
          titulo="Con cargo"
          detalle={`De ${DIAS_GRACIA + 1} días en adelante`}
          valor={textos.conCargo}
          alCambiar={(v) => cambiar('conCargo', v)}
          advertencia={
            textos.conCargo.includes('{importe}')
              ? null
              : 'Este texto no dice cuánto lleva acumulado: le falta {importe}.'
          }
          ejemplo={textoDelAviso(textos, {
            cliente: 'ANCAP',
            serie: 'CIL-00101',
            fechaEntrega: sumarDias(hoy, -92),
            dias: 92,
            importe: 469,
          })}
        />

        <EditorDeTexto
          titulo="Por vencer"
          detalle={`De 54 a ${DIAS_GRACIA} días, todavía sin cargo`}
          valor={textos.porVencer}
          alCambiar={(v) => cambiar('porVencer', v)}
          advertencia={
            textos.porVencer.includes('{importe}')
              ? 'Este texto lleva {importe}: los operarios no lo van a poder mandar, porque no ven la plata.'
              : null
          }
          ejemplo={textoDelAviso(textos, {
            cliente: 'Taller Pereira',
            serie: 'CIL-00103',
            fechaEntrega: sumarDias(hoy, -57),
            dias: 57,
            importe: 0,
          })}
        />

        <section className="space-y-2 rounded-2xl border border-linea bg-white p-4">
          <h2 className="font-titulo text-xl font-bold">Copia de los mails</h2>
          <Campo
            etiqueta="Mandar copia oculta a"
            valor={textos.copiaMail ?? ''}
            alCambiar={(v) => {
              setTextos((t) => ({ ...t, copiaMail: v }));
              setHecho(false);
            }}
            modo="email"
            ayuda={
              copiaValida
                ? 'Le llega cada mail automático que sale, sin que el cliente lo vea. Vacío: a nadie.'
                : 'Eso no parece un mail. Revisalo o dejalo vacío.'
            }
          />
        </section>

        <ErrorDeFormulario mensaje={error} />
        {hecho && (
          <p role="status" className="text-sm font-semibold text-gracia">
            Listo. Los próximos avisos salen con este texto.
          </p>
        )}

        <div className="space-y-2">
          <button type="submit" disabled={!cambiado || vacio || guardando} className={claseBotonPrincipal}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {!esOriginal && (
            <button
              type="button"
              onClick={() => {
                setTextos((t) => ({ ...TEXTOS_AVISO_ORIGINALES, copiaMail: t.copiaMail }));
                setHecho(false);
              }}
              className={claseBotonSecundario}
            >
              Volver al texto original
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function EditorDeTexto({
  titulo,
  detalle,
  valor,
  alCambiar,
  advertencia,
  ejemplo,
}: {
  titulo: string;
  detalle: string;
  valor: string;
  alCambiar(nuevo: string): void;
  advertencia: string | null;
  ejemplo: string | null;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const desconocidos = huecosDesconocidos(valor);

  function insertar(hueco: string) {
    const campo = area.current;
    const desde = campo?.selectionStart ?? valor.length;
    const hasta = campo?.selectionEnd ?? valor.length;
    alCambiar(valor.slice(0, desde) + hueco + valor.slice(hasta));

    // El cursor queda después del hueco, para seguir escribiendo.
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(desde + hueco.length, desde + hueco.length);
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linea bg-white p-4">
      <div>
        <h2 className="font-titulo text-xl font-bold">{titulo}</h2>
        <p className="text-sm text-tinta-2">{detalle}</p>
      </div>

      <textarea
        ref={area}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        rows={6}
        aria-label={`Texto del aviso ${titulo.toLowerCase()}`}
        className="w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white p-3 text-base leading-snug focus:border-marca focus:outline-none"
      />

      <div className="flex flex-wrap gap-2">
        {HUECOS_AVISO.map(({ hueco, explicacion }) => (
          <button
            key={hueco}
            type="button"
            onClick={() => insertar(hueco)}
            title={explicacion}
            aria-label={`Agregar ${hueco}: ${explicacion}`}
            className="h-11 rounded-full border-[1.5px] border-linea-fuerte bg-fondo px-3 font-mono text-sm font-bold active:bg-linea"
          >
            {hueco}
          </button>
        ))}
      </div>

      {desconocidos.length > 0 && (
        <p className="rounded-xl border border-vencer-borde bg-vencer-suave p-3 text-sm text-vencer">
          {desconocidos.join(', ')} no {desconocidos.length === 1 ? 'es un hueco' : 'son huecos'}: va a
          salir así, tal cual, en el mensaje.
        </p>
      )}
      {advertencia !== null && (
        <p className="rounded-xl border border-vencer-borde bg-vencer-suave p-3 text-sm text-vencer">
          {advertencia}
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wider text-tinta-2 uppercase">Así se ve</p>
        {/* Como una burbuja de WhatsApp: verde clarito, con el texto respetando los saltos de línea. */}
        <p className="rounded-2xl rounded-tr-sm bg-gracia-suave p-3 text-[15px] leading-snug whitespace-pre-wrap text-tinta">
          {ejemplo ?? '—'}
        </p>
      </div>
    </section>
  );
}
