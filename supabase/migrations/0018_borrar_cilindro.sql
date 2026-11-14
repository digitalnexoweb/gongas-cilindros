-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Borrar un cilindro dado de alta por error
--
-- La misma regla que para los clientes (0017): se borra solo lo que no tiene
-- historia real. Un cilindro que ya estuvo en un cliente no se borra, porque
-- se perderían registros de plata; para esos sigue estando "dar de baja".
-- ═══════════════════════════════════════════════════════════════════════════

-- Solo el administrador, igual que editar un cilindro.
create function public.borrar_cilindro(p_cilindro_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_deshechos uuid[];
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede borrar cilindros.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.cilindros c where c.id = p_cilindro_id for update;
  if not found then
    raise exception 'El cilindro no existe.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.arriendos a where a.cilindro_id = p_cilindro_id and a.fecha_devolucion is null) then
    raise exception 'Está en un cliente: no se puede borrar.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.arriendos a where a.cilindro_id = p_cilindro_id)
     or exists (
       select 1 from public.movimientos m
       where m.cilindro_id = p_cilindro_id
         and not exists (select 1 from public.anulaciones a where a.movimiento_id = m.id)
     )
     or exists (select 1 from public.avisos v where v.cilindro_id = p_cilindro_id)
  then
    raise exception 'Tiene movimientos registrados: no se puede borrar sin perder su historia. Se puede dar de baja.'
      using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(m.id), '{}') into v_deshechos
  from public.movimientos m
  where m.cilindro_id = p_cilindro_id;

  if cardinality(v_deshechos) > 0 then
    perform public.borrar_movimientos_deshechos(v_deshechos);
  end if;

  -- La tarifa se va sola (on delete cascade, 0001).
  delete from public.cilindros where id = p_cilindro_id;
end
$$;

revoke execute on function public.borrar_cilindro(uuid) from public, anon;
grant execute on function public.borrar_cilindro(uuid) to authenticated;
