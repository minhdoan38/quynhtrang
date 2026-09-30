-- State 40 Fulfillment Operations Invariants Test
-- Run in transaction with rollback

begin;

-- Verify 0005 functions exist
select proname from pg_proc
where proname in ('start_order_production', 'complete_order_production', 'cancel_order')
  and pronamespace = 'public'::regnamespace;

-- Test unauthenticated call to start_order_production returns UNAUTHENTICATED
do $$
declare
  v_res jsonb;
begin
  v_res := public.start_order_production(gen_random_uuid(), null, 'test-req-1');
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'UNAUTHENTICATED' then
    raise exception 'Expected start_order_production to reject unauthenticated call, got: %', v_res;
  end if;
end $$;

-- Test unauthenticated call to cancel_order returns UNAUTHENTICATED
do $$
declare
  v_res jsonb;
begin
  v_res := public.cancel_order(gen_random_uuid(), 'Lý do hủy hợp lệ', 'test-req-2');
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'UNAUTHENTICATED' then
    raise exception 'Expected cancel_order to reject unauthenticated call, got: %', v_res;
  end if;
end $$;

rollback;
