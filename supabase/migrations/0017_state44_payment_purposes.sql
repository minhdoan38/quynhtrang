-- State 44: requirement.paid confirms only that requirement, not whole-order settlement.
-- 0010 already backfilled legacy rows as full_order_payment and installed
-- unique(order_id, purpose). No historical payment values are rewritten here.
alter table public.orders drop constraint orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (
  payment_status in ('pending_payment', 'payment_reported', 'paid', 'deposit_confirmed', 'payment_failed', 'cancelled')
);

drop function public.confirm_order_payment(uuid, text);
create function public.confirm_order_payment(
  p_order_id uuid, p_expected_state text, p_purpose text, p_payment_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_purpose text;
  v_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_roles where user_id = auth.uid() and role = 'admin'
  ) then return jsonb_build_object('code', 'forbidden'); end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  v_purpose := case when v_order.payment_policy->>'kind' = 'fixed_deposit' then 'checkout_deposit' else 'full_order_payment' end;
  if p_purpose is distinct from v_purpose then return jsonb_build_object('code', 'state_conflict'); end if;
  select * into v_payment from public.order_payments
    where order_id = p_order_id and purpose = p_purpose
      and (p_payment_id is null or id = p_payment_id) for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if v_order.fulfillment_status = 'cancelled' or v_order.payment_status = 'cancelled' or v_payment.status = 'cancelled' then
    return jsonb_build_object('code', 'cancelled');
  end if;
  if v_payment.amount is distinct from coalesce(v_order.amount_due_now, v_order.total)
    or v_payment.currency is distinct from v_order.currency then
    return jsonb_build_object('code', 'state_conflict');
  end if;
  v_status := case when p_purpose = 'checkout_deposit' then 'deposit_confirmed' else 'paid' end;
  if v_payment.status = 'paid' then
    return jsonb_build_object('code', 'already_paid', 'payment_status', v_status);
  end if;
  if p_expected_state is null or p_expected_state not in ('pending_payment', 'payment_reported')
    or v_payment.status is distinct from p_expected_state then
    return jsonb_build_object('code', 'state_conflict');
  end if;
  update public.order_payments set status = 'paid', confirmed_at = clock_timestamp(), confirmed_by = auth.uid()
    where id = v_payment.id;
  update public.orders set payment_status = v_status where id = p_order_id;
  insert into public.order_events(order_id, event_type, actor_user_id, actor_role, payload)
    values(p_order_id, 'payment_confirmed', auth.uid(), 'admin', jsonb_build_object(
      'payment_id', v_payment.id, 'purpose', p_purpose, 'amount', v_payment.amount,
      'expected_amount', coalesce(v_order.amount_due_now, v_order.total),
      'previous_status', v_payment.status, 'resulting_status', 'paid', 'payment_status', v_status));
  return jsonb_build_object('code', 'confirmed', 'order_id', p_order_id,
    'payment_id', v_payment.id, 'purpose', p_purpose, 'payment_status', v_status);
end;
$$;
revoke all on function public.confirm_order_payment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, uuid) to authenticated;

-- Service-only mutation: HTTP route verifies guest/staff proof before invoking.
-- Same lock order as confirmation prevents a delayed report from downgrading paid.
create function public.report_checkout_payment(p_order_id uuid, p_purpose text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_purpose text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  v_purpose := case when v_order.payment_policy->>'kind' = 'fixed_deposit' then 'checkout_deposit' else 'full_order_payment' end;
  if p_purpose is distinct from v_purpose then return jsonb_build_object('code', 'state_conflict'); end if;
  select * into v_payment from public.order_payments where order_id = p_order_id and purpose = p_purpose for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if v_order.fulfillment_status = 'cancelled' or v_order.payment_status = 'cancelled' then
    return jsonb_build_object('code', 'cancelled');
  end if;
  if v_payment.status = 'paid' then return jsonb_build_object('code', 'already_paid'); end if;
  if v_payment.status = 'payment_reported' then return jsonb_build_object('code', 'already_reported'); end if;
  if v_payment.status <> 'pending_payment' then return jsonb_build_object('code', 'state_conflict'); end if;
  update public.order_payments set status = 'payment_reported', customer_reported_at = clock_timestamp() where id = v_payment.id;
  update public.orders set payment_status = 'payment_reported' where id = p_order_id;
  insert into public.order_events(order_id, event_type, actor_role, payload)
    values(p_order_id, 'PAYMENT_REPORTED', 'customer', jsonb_build_object(
      'payment_id', v_payment.id, 'purpose', p_purpose, 'amount', v_payment.amount));
  return jsonb_build_object('code', 'reported');
end;
$$;
revoke all on function public.report_checkout_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.report_checkout_payment(uuid, text) to service_role;
