import { nombreDelMes, type Mes } from '../../dominio/resumen';

/** El mes que se mira. Sobre la tarjeta azul va claro; sobre el fondo, como un campo común. */
export function SelectorMes({
  mes,
  meses,
  alElegir,
  oscuro = false,
}: {
  mes: Mes;
  meses: Mes[];
  alElegir(mes: Mes): void;
  oscuro?: boolean;
}) {
  return (
    <select
      value={mes}
      onChange={(e) => alElegir(e.target.value)}
      aria-label="Mes"
      className={`h-12 w-full rounded-[15px] px-4 text-base font-semibold first-letter:uppercase focus:outline-none ${
        oscuro
          ? 'border-[1.5px] border-white/25 bg-white/10 text-white focus:border-white'
          : 'border-[1.5px] border-linea-fuerte bg-white text-tinta focus:border-marca'
      }`}
    >
      {meses.map((m) => (
        <option key={m} value={m} className="text-tinta">
          {nombreDelMes(m)}
        </option>
      ))}
    </select>
  );
}
