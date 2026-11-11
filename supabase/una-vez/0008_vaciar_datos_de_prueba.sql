-- GONGAS — vaciar los datos de prueba antes de arrancar con los de verdad.
--
-- SE CORRE UNA SOLA VEZ, a mano, sobre el proyecto real. Por eso no está en
-- migrations/: los tests arman su base desde esas migraciones, y esto la vaciaría.
-- Se corrió el 10/11/2026, antes de pasarle el link a Joaquín.
--
-- Las etiquetas impresas para la rotuladora empiezan en CIL-00001, las mismas
-- series que usaban las pruebas. Sin vaciar, el primer cilindro real aparecería
-- con historial ajeno.
--
-- Qué borra: movimientos, arriendos, tarifas por cilindro, cilindros y clientes.
-- Qué no toca: el esquema, los permisos, las tarifas por tamaño y las cuentas.

begin;

-- Los movimientos son inmutables por diseño. El trigger se apaga solo dentro de
-- esta transacción: si algo falla, el rollback lo deja prendido como estaba.
alter table public.movimientos disable trigger movimientos_inmutables;

delete from public.movimientos;
delete from public.arriendos;
delete from public.tarifas;
delete from public.cilindros;
delete from public.clientes;

alter table public.movimientos enable trigger movimientos_inmutables;

-- El primer lote real es LOTE-0001.
alter sequence public.numero_de_lote restart with 1;

commit;
