-- State 41 Account Migration & Customer Portal Invariants Test
-- Run in transaction with rollback

begin;

-- Verify profiles table exists
select user_id, display_name, phone from public.profiles limit 1;

-- Verify orders.customer_user_id column exists
select customer_user_id from public.orders limit 1;

-- Verify projects.working_document and origin_local_project_id exist
select working_document, origin_local_project_id from public.projects limit 1;

-- Verify 0006 functions exist
select proname from pg_proc
where proname in ('claim_guest_order_and_project', 'get_customer_orders', 'get_customer_order_detail', 'save_customer_project_revision')
  and pronamespace = 'public'::regnamespace;

-- Test unauthenticated claim rejected
do $$
declare
  v_res jsonb;
begin
  v_res := public.claim_guest_order_and_project(gen_random_uuid(), 'test-token');
  if (v_res->>'success')::boolean = true or (v_res->>'error') <> 'UNAUTHENTICATED' then
    raise exception 'Expected claim_guest_order_and_project to reject unauthenticated call, got: %', v_res;
  end if;
end $$;

rollback;
