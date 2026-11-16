-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Pesos nuevos desde el alta, sin tarifa todavía
--
-- Si entra un cilindro de un peso que no está en la lista, cualquier usuario
-- lo agrega en el momento de darlo de alta. La tarifa es plata: la pone el
-- administrador después, en Ajustes → Tarifas. Mientras tanto el peso y sus
-- cilindros quedan sin tarifa (alta_cilindro ya lo permite desde 0014).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────── agregar_peso

create function public.agregar_peso(p_kg numeric) returns numeric
language plpgsql security definer
set search_path = ''
as $$
declare
  v_kg numeric := round(p_kg, 1);
  v_activo boolean;
begin
  if not public.usuario_activo() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if v_kg is null or v_kg <= 0 or v_kg >= 1000 then
    raise exception 'El peso tiene que ser un número de kilos mayor que cero.' using errcode = 'check_violation';
  end if;

  select t.activo into v_activo from public.tamanos t where t.kg = v_kg for update;

  if found and v_activo then
    raise exception 'Ese peso ya está en la lista.' using errcode = 'unique_violation';
  end if;

  if found then
    -- Estaba oculto: vuelve a ofrecerse, con la tarifa que tuviera.
    update public.tamanos set activo = true where kg = v_kg;
  else
    insert into public.tamanos (kg) values (v_kg);
  end if;

  return v_kg;
end
$$;

revoke execute on function public.agregar_peso(numeric) from public, anon;
grant execute on function public.agregar_peso(numeric) to authenticated;

-- ───────────────────────────────────────────── cambiar_tarifa_de_kilos, también sin tarifa previa

-- La misma de 0014, más dos cosas: un peso que todavía no tenía tarifa la
-- recibe, y los cilindros de ese peso que estaban sin tarifa también.
create or replace function public.cambiar_tarifa_de_kilos(p_kg numeric, p_tarifa numeric) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vieja numeric;
  v_cambiados integer;
  v_nuevos integer;
begin
  if not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if p_tarifa is null or p_tarifa < 0 then
    raise exception 'La tarifa tiene que ser un número mayor o igual a cero.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.tamanos t where t.kg = p_kg) then
    raise exception 'Ese peso no está en la lista: % kg.', p_kg using errcode = 'check_violation';
  end if;

  select t.tarifa_mensual into v_vieja
  from public.tarifas_por_kilos t
  where t.kg = p_kg
  for update;

  if found then
    update public.tarifas_por_kilos set tarifa_mensual = p_tarifa where kg = p_kg;

    update public.tarifas t
    set tarifa_mensual = p_tarifa
    from public.cilindros c
    where c.id = t.cilindro_id
      and c.kg = p_kg
      and t.tarifa_mensual = v_vieja;

    get diagnostics v_cambiados = row_count;
  else
    insert into public.tarifas_por_kilos (kg, tarifa_mensual) values (p_kg, p_tarifa);
    v_cambiados := 0;
  end if;

  -- Los cilindros de ese peso que estaban sin tarifa.
  insert into public.tarifas (cilindro_id, tarifa_mensual)
  select c.id, p_tarifa
  from public.cilindros c
  where c.kg = p_kg
    and not exists (select 1 from public.tarifas t where t.cilindro_id = c.id);

  get diagnostics v_nuevos = row_count;
  return v_cambiados + v_nuevos;
end
$$;
