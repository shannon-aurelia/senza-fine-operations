create table if not exists public.sf_item_catalog (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  sku text,
  brand text not null default '',
  uom text not null default 'unit',
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sf_item_catalog_identity_idx
on public.sf_item_catalog (lower(category), lower(item_name), lower(brand));
create unique index if not exists sf_item_catalog_sku_idx
on public.sf_item_catalog (lower(sku)) where sku is not null and trim(sku) <> '';

alter table public.sf_item_catalog enable row level security;
revoke all on public.sf_item_catalog from anon, authenticated;

insert into public.sf_item_catalog (category, item_name, sku, brand, uom, created_by)
select distinct coalesce(nullif(trim(type), ''), 'Uncategorized'), trim(item_name), nullif(trim(sku), ''), coalesce(trim(brand), ''), coalesce(nullif(trim(uom), ''), 'unit'), 'Recovered inventory'
from public.sf_inventory
where trim(coalesce(item_name, '')) <> ''
on conflict do nothing;
