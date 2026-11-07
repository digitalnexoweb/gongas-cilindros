import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * La cámara en escaneo continuo.
 *
 * Camino nativo: `BarcodeDetector`, que es lo que tiene Chrome en Android, que
 * es el dispositivo del cliente. Respaldo: `@zxing/browser`, que se baja con un
 * `import()` dinámico solo si hace falta, para no pesar en el camino bueno.
 */

export type EstadoEscaner =
  | 'inactivo'
  | 'pidiendo_permiso'
  | 'escaneando'
  | 'sin_permiso'
  | 'sin_camara'
  | 'error';

/** `BarcodeDetector` no está en los tipos del DOM todavía. */
type CodigoDetectado = { rawValue: string };
type DetectorDeCodigos = { detect(fuente: HTMLVideoElement): Promise<CodigoDetectado[]> };
type ConstructorDetector = new (opciones?: { formats?: string[] }) => DetectorDeCodigos;

const MS_ENTRE_LECTURAS = 200;

export function useEscaner({
  activo,
  alLeer,
}: {
  activo: boolean;
  alLeer(texto: string): void;
}): {
  estado: EstadoEscaner;
  videoRef: RefObject<HTMLVideoElement | null>;
  mensaje: string | null;
  /** Cuál de los dos caminos está corriendo, para poder contarlo. */
  motor: 'nativo' | 'zxing' | null;
  reintentar(): void;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Por ref, para que cambiar el callback no reinicie la cámara en cada render.
  const alLeerRef = useRef(alLeer);
  alLeerRef.current = alLeer;

  const [estado, setEstado] = useState<EstadoEscaner>('inactivo');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [motor, setMotor] = useState<'nativo' | 'zxing' | null>(null);
  const [intento, setIntento] = useState(0);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    if (!activo) {
      setEstado('inactivo');
      setMotor(null);
      return;
    }

    let cancelado = false;
    let stream: MediaStream | null = null;
    let temporizador: number | null = null;
    let controlesZxing: { stop(): void } | null = null;

    /**
     * Apaga todo. Cortar los tracks no es optativo: si no, la luz de la cámara
     * queda prendida y el celular se calienta aunque la pantalla haya cambiado.
     */
    function detener() {
      if (temporizador !== null) {
        window.clearInterval(temporizador);
        temporizador = null;
      }

      controlesZxing?.stop();
      controlesZxing = null;

      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;

      if (videoRef.current !== null) videoRef.current.srcObject = null;
    }

    async function arrancar() {
      setMensaje(null);
      setMotor(null);
      setEstado('pidiendo_permiso');

      if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        setEstado('sin_camara');
        setMensaje('Este dispositivo no permite usar la cámara desde el navegador.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (error) {
        if (cancelado) return;
        const nombre = error instanceof DOMException ? error.name : '';

        if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
          setEstado('sin_permiso');
          setMensaje('Para escanear hay que darle permiso a la cámara.');
        } else if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
          setEstado('sin_camara');
          setMensaje('No se encontró ninguna cámara.');
        } else {
          setEstado('error');
          setMensaje('No se pudo abrir la cámara.');
        }
        return;
      }

      const video = videoRef.current;
      if (cancelado || video === null) {
        detener();
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;

      try {
        await video.play();
      } catch {
        // Si la pantalla cambió mientras arrancaba, play() rechaza. No es un error.
      }

      if (cancelado) {
        detener();
        return;
      }

      setEstado('escaneando');

      const Detector = (globalThis as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;

      if (Detector !== undefined) {
        setMotor('nativo');
        const detector = new Detector({ formats: ['qr_code'] });

        temporizador = window.setInterval(() => {
          // readyState < HAVE_CURRENT_DATA: todavía no hay cuadro que mirar.
          if (video.readyState < 2) return;

          void detector
            .detect(video)
            .then((codigos) => {
              for (const codigo of codigos) {
                if (codigo.rawValue !== '') alLeerRef.current(codigo.rawValue);
              }
            })
            .catch(() => {
              // Un cuadro que no se pudo leer no es un error: viene el siguiente.
            });
        }, MS_ENTRE_LECTURAS);

        return;
      }

      // Respaldo.
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelado) {
          detener();
          return;
        }

        setMotor('zxing');
        const lector = new BrowserQRCodeReader();
        controlesZxing = await lector.decodeFromVideoElement(video, (resultado) => {
          if (resultado !== undefined) alLeerRef.current(resultado.getText());
        });
      } catch {
        if (cancelado) return;
        setEstado('error');
        setMensaje('No se pudo iniciar el lector de códigos.');
      }
    }

    void arrancar();

    return () => {
      cancelado = true;
      detener();
    };
  }, [activo, intento]);

  return { estado, videoRef, mensaje, motor, reintentar };
}
