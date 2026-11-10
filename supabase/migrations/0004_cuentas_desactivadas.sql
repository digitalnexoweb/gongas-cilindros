-- GONGAS — una cuenta nueva nace desactivada.
--
-- Hasta acá, una cuenta recién creada quedaba activa y como empleado. Si el
-- registro público de Supabase quedara abierto por descuido, cualquiera que se
-- anotara entraría a ver los datos.
--
-- Ahora una cuenta nueva no ve nada hasta que un administrador la activa. El
-- registro público igual se apaga en el panel; esto es la segunda traba, la
-- que no depende de que alguien se acuerde de apagarlo.

alter table public.perfiles alter column activo set default false;
