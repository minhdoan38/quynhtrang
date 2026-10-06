import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';


test('State 45 migration guards active drafts, pricing tiers, and version pointers', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/0022_state45_integrity_constraints.sql'), 'utf8');
  assert.match(sql, /;\s*$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, 'SQL dollar quotes must be balanced');


  assert.match(sql, /do\s+\$\$[\s\S]*row_number\(\)\s+over[\s\S]*partition by order_id[\s\S]*order by updated_at desc, id desc[\s\S]*partition by template_id[\s\S]*partition by product_id[\s\S]*partition by rule_id, minimum_quantity[\s\S]*\$\$;[\s\S]*create unique index/i);
  assert.match(sql, /state45_integrity_quarantine[\s\S]*to_jsonb/i);
  assert.match(sql, /create unique index if not exists design_revision_drafts_one_active_order[\s\S]*on public\.design_revision_drafts\s*\(order_id\)[\s\S]*where status in \('editing', 'ready_for_review'\)/i);
  assert.match(sql, /create unique index if not exists template_drafts_one_active_template\s+on public\.template_drafts\s*\(template_id\)\s*;/i);
  assert.match(sql, /create unique index if not exists product_commercial_drafts_one_active_product\s+on public\.product_commercial_drafts\s*\(product_id\)\s*;/i);
  assert.doesNotMatch(sql, /where id is not null/i);
  assert.match(sql, /create unique index if not exists commercial_pricing_tiers_rule_minimum_quantity[\s\S]*on public\.commercial_pricing_tiers\s*\(rule_id, minimum_quantity\)/i);
  assert.match(sql, /foreign key \(id, current_commercial_config_version_id\)[\s\S]*references public\.product_commercial_config_versions\s*\(product_id, id\)/i);
  assert.match(sql, /foreign key \(project_id, customer_approved_design_version_id\)[\s\S]*references public\.design_versions\s*\(project_id, id\)/i);
  assert.match(sql, /foreign key \(project_id, production_design_version_id\)[\s\S]*references public\.design_versions\s*\(project_id, id\)/i);
  assert.match(sql, /not valid/i);
  assert.match(sql, /exception\s+when duplicate_object then\s+null/i);
});

test('State 45 integrity SQL exercises every rejecting constraint and rolls back', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/state45_integrity.sql'), 'utf8');
  assert.match(sql, /;\s*$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, 'SQL dollar quotes must be balanced');


  assert.match(sql, /design_revision_drafts[\s\S]*unique_violation/i);
  assert.match(sql, /template_drafts[\s\S]*unique_violation/i);
  assert.match(sql, /product_commercial_drafts[\s\S]*unique_violation/i);
  assert.match(sql, /commercial_pricing_tiers[\s\S]*unique_violation/i);
  assert.match(sql, /update public\.products[\s\S]*current_commercial_config_version_id\s*=\s*gen_random_uuid\(\)[\s\S]*foreign_key_violation/i);
  assert.match(sql, /cross-project[\s\S]*update public\.orders[\s\S]*project_id[\s\S]*production_design_version_id[\s\S]*foreign_key_violation/i);
  assert.match(sql, /nonexistent order design version[\s\S]*foreign_key_violation/i);
  assert.match(sql, /rollback;\s*$/i);
});

test('State 45 security SQL covers private reads, tenant isolation, and editor production denial', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/state45_security.sql'), 'utf8');
  assert.match(sql, /;\s*$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, 'SQL dollar quotes must be balanced');


  for (const table of ['orders', 'assets', 'design_versions']) {
    assert.match(sql, new RegExp(`public\\.${table}`, 'i'));
  }
  assert.match(sql, /set local role anon/i);
  assert.match(sql, /customer A cannot read customer B|customer_a[\s\S]*customer_b/i);
  assert.match(sql, /start_order_production/i);
  assert.match(sql, /complete_order_production/i);
  assert.match(sql, /FORBIDDEN/i);
  assert.match(sql, /rollback;\s*$/i);
});
