/**
 * La vibración y el pitido corto de cada lectura, que pide la sección 6.1.
 * El sonido se genera con WebAudio: no hace falta ningún archivo.
 */

let contexto: AudioContext | null = null;

export function senalDeLectura(): void {
  vibrar();
  pitido();
}

function vibrar(): void {
  try {
    navigator.vibrate?.(40);
  } catch {
    // En iOS no existe. No es motivo para romper nada.
  }
}

function pitido(): void {
  try {
    // Se crea recién en la primera lectura: para entonces ya hubo un toque del
    // usuario, que es lo que los navegadores exigen para dejar sonar audio.
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') void contexto.resume();

    const ahora = contexto.currentTime;
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();

    oscilador.type = 'sine';
    oscilador.frequency.value = 880;

    // Con rampas, para que no haga "clic" al empezar y al cortar.
    volumen.gain.setValueAtTime(0.0001, ahora);
    volumen.gain.exponentialRampToValueAtTime(0.15, ahora + 0.01);
    volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.12);

    oscilador.connect(volumen).connect(contexto.destination);
    oscilador.start(ahora);
    oscilador.stop(ahora + 0.13);
  } catch {
    // Sin sonido se sigue escaneando igual.
  }
}
