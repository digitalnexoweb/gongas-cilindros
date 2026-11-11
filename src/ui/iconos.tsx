/**
 * Iconos de línea de DISENO.md: SVG en línea, trazo redondeado. Todos son
 * decorativos (`aria-hidden`): el texto de al lado dice lo mismo.
 */

import type { ReactNode } from 'react';

type Props = { className?: string; trazo?: number };

function Icono({ className = 'size-5', trazo = 2.4, children }: Props & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={trazo}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Sale hacia un cliente. */
export function FlechaDerecha(props: Props) {
  return (
    <Icono {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icono>
  );
}

/** Vuelve al stock. */
export function FlechaIzquierda(props: Props) {
  return (
    <Icono {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icono>
  );
}

export function Atras(props: Props) {
  return (
    <Icono {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icono>
  );
}

export function Adelante(props: Props) {
  return (
    <Icono {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icono>
  );
}

export function Tilde(props: Props) {
  return (
    <Icono {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icono>
  );
}

export function Alerta(props: Props) {
  return (
    <Icono {...props}>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </Icono>
  );
}

export function Reloj(props: Props) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icono>
  );
}

export function Cruz(props: Props) {
  return (
    <Icono {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icono>
  );
}

export function WhatsApp(props: Props) {
  return (
    <Icono {...props}>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20Z" />
      <path d="M9.5 9.5c0 2.5 2.5 5 5 5l1-1.5-2-1-1 .8a3.5 3.5 0 0 1-1.8-1.8l.8-1-1-2-1.5 1Z" />
    </Icono>
  );
}
