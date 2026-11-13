-- GONGAS — los 16 cilindros reales de Joaquín, con el código que traen y su peso.
--
-- SE CORRE UNA VEZ sobre el proyecto real. Joaquín pasó la lista escrita a mano
-- el 13/11/2026; los códigos se confirmaron uno por uno antes de cargarlos.
--
-- Cada uno entra con Acetileno como gas inicial (en cada entrega se elige el
-- gas) y la tarifa de su peso. Si un código ya existiera, no lo duplica.

insert into public.cilindros (serie, kg, tipo_gas)
select v.serie, v.kg, 'Acetileno'
from (values
  ('762', 7),
  ('104409', 6),
  ('730024', 2),
  ('729026', 4),
  ('729033', 4),
  ('729035', 4),
  ('729034', 4),
  ('729053', 4),
  ('729005', 4),
  ('729032', 4),
  ('729025', 4),
  ('729027', 4),
  ('729043', 4),
  ('729017', 4),
  ('729047', 4),
  ('729012', 4)
) as v (serie, kg)
on conflict (serie) do nothing;

insert into public.tarifas (cilindro_id, tarifa_mensual)
select c.id, t.tarifa_mensual
from public.cilindros c
join public.tarifas_por_kilos t on t.kg = c.kg
where c.serie in (
  '762', '104409', '730024', '729026', '729033', '729035', '729034', '729053',
  '729005', '729032', '729025', '729027', '729043', '729017', '729047', '729012'
)
on conflict (cilindro_id) do nothing;
