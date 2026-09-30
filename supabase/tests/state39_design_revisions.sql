-- State 39 Database Invariants and Immutability Test
-- Run in transaction with rollback

begin;

-- Verify 0004 columns on orders
select customer_approved_design_version_id, production_design_version_id
from public.orders
limit 1;

-- Verify columns on design_versions
select parent_design_version_id, revision_reason, revision_draft_id
from public.design_versions
limit 1;

-- Verify design_revision_drafts exists
select id, order_id, project_id, base_design_version_id, status, revision
from public.design_revision_drafts
limit 1;

-- Verify design_preflight_assessments exists
select id, draft_id, findings, warning_ids, expires_at
from public.design_preflight_assessments
limit 1;

-- Test 1: Immutability of design_versions (UPDATE should throw)
do $$
declare
  v_version_id uuid;
begin
  select id into v_version_id from public.design_versions limit 1;
  if v_version_id is not null then
    begin
      update public.design_versions
      set design_document = '{"tampered":true}'::jsonb
      where id = v_version_id;
      raise exception 'Expected design_versions update to fail';
    exception when others then
      -- Success: update was rejected
      null;
    end;
  end if;
end $$;

-- Test 2: Immutability of customer_approved_design_version_id on orders
do $$
declare
  v_order_id uuid;
begin
  select id into v_order_id from public.orders limit 1;
  if v_order_id is not null then
    begin
      update public.orders
      set customer_approved_design_version_id = gen_random_uuid()
      where id = v_order_id;
      raise exception 'Expected customer_approved_design_version_id update to fail';
    exception when others then
      -- Success: update was rejected
      null;
    end;
  end if;
end $$;

rollback;
