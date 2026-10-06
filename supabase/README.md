# Base de datos VitalGym

## Aplicar las migraciones de 2026-10-05

Nada se aplica solo: son archivos para pegar en Supabase Dashboard > SQL Editor, **en este orden**.

1. `diagnostics/01_introspection.sql` — solo lectura. Confirma que producción coincide con `schema.sql` y
   que **ningún cliente tiene dos suscripciones activas** (si las hay, la migración 04 aborta a propósito).
2. `diagnostics/02_balance_preview_pre_migration.sql` — solo lectura. Muestra, por suscripción activa, saldo
   actual vs. saldo nuevo y el ajuste "saldo inicial migración" que se insertará. `diff` debe ser 0 en todas.
3. `migrations/2026-10-05_01_payments_due_date.sql`
4. `migrations/2026-10-05_02_profiles_birth_date.sql`
5. `migrations/2026-10-05_03_booking_attendance.sql`
6. `migrations/2026-10-05_04_subscription_lifecycle.sql`
7. `migrations/2026-10-05_05_class_adjustments_and_balance.sql`
8. `diagnostics/03_balance_check_post_migration.sql` — solo lectura. `diff` debe ser 0.

Cada migración es idempotente (se puede re-ejecutar) y trae su reversa comentada al final.
**Aplica las migraciones ANTES de desplegar el código**: la app nueva lee las vistas
`subscription_class_balance` y `subscription_history`, que no existen hasta la migración 05.

## Cómo se calcula el saldo de clases

`subscriptions.classes_remaining` quedó **congelado como legado** (nadie lo escribe ni lo lee).
La fuente única es la vista `subscription_class_balance`:

    available = derecho_del_plan + SUM(ajustes) − usadas

- **derecho_del_plan**: `classes_per_month × cuotas iniciadas` (1, 2 o 3; la cuota *n* inicia en
  `start_date + (n−1) meses`, igual que los vencimientos de pago). Plan de prueba (`plans.is_trial`):
  `classes_per_month` en total. Ilimitado (≥ 9999): `available = 9999`.
- **usadas**: reservas del cliente en estado `completed`, `no_show` o `cancelled` con `late_cancel = true`
  (cancelación con menos de 4 h). Cancelar con 4 h o más no descuenta.
- **Asignación a suscripciones** (`bookings` no tiene `subscription_id`): cada reserva cuenta en la
  suscripción del mismo cliente cuyo rango `[start_date, end_date)` contiene la fecha de la clase (hora de
  Santiago). `end_date` es exclusivo, así que en una renovación adyacente (nueva `start_date` = `end_date`
  anterior) la clase del día del corte cuenta solo en la nueva. Si por datos viejos dos rangos se solaparan,
  gana la de `start_date` más reciente.
- **Vigencia**: `available` es 0 si la suscripción no está vigente (finalizada, pausada o programada futura).
  Las clases que sobraron al terminar el trimestre se pierden (`lost_classes` las informa) salvo que se
  sumen como ajuste a la suscripción nueva.
- Corregir un estado después (`completed` → `no_show`, `cancelled` → `completed`…) no requiere tocar
  nada más: el saldo se recalcula desde las reservas.

Estados de suscripción: `scheduled` (renovación con inicio futuro) → `active` (máx. una por cliente) →
`expired` (por `end_date`, o cerrada por el admin); `paused` aparte. El job `roll-subscriptions` (cada 15
min) finaliza lo vencido y activa las programadas; la vista además decide "vigente" por fecha, así que un
retraso del cron no altera el saldo.

## Cargar un ajuste de clases por SQL (mientras no exista el botón del panel admin)

Solo el admin escribe en `class_adjustments`. `quantity` es positivo (suma) o negativo (resta);
`reason`: recuperación, cortesía, corrección, reagendada, arrastre, etc.

```sql
-- 1) Buscar la suscripción vigente del cliente
SELECT subscription_id, plan_name, available, entitled, adjustments, used
FROM public._subscription_balance_calc
WHERE client_id = '<uuid-del-cliente>' AND is_current;

-- 2) Insertar el ajuste (booking_id es opcional: la reserva que lo origina)
INSERT INTO public.class_adjustments (subscription_id, quantity, reason, booking_id)
VALUES ('<subscription_id>', 2, 'recuperación', NULL);

-- 3) Verificar
SELECT available FROM public._subscription_balance_calc WHERE subscription_id = '<subscription_id>';
```

En el SQL Editor `auth.uid()` es NULL, por eso `created_by` queda NULL (se puede completar con
`created_by` = uuid del admin). Para arrastrar clases sobrantes de una suscripción que terminó a la nueva,
usa `reason = 'arrastre'` sobre la suscripción **nueva**.
Las vistas públicas filtran por `auth.uid()`: en el SQL Editor se consulta la interna `_subscription_balance_calc`.

## Historial de suscripciones por cliente

```sql
SELECT * FROM public.subscription_history WHERE client_id = '<uuid-del-cliente>';  -- más reciente primero
```
