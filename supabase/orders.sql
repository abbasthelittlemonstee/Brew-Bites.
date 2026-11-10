create extension if not exists pgcrypto;

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    consented_at timestamptz not null default now(),
    customer_name text not null,
    customer_phone text not null,
    fulfilment text not null check (fulfilment in ('pickup', 'delivery')),
    status text not null default 'new',
    delivery_area text,
    delivery_address text,
    items jsonb not null,
    packages jsonb not null,
    items_subtotal integer not null check (items_subtotal >= 0),
    package_savings integer not null check (package_savings >= 0),
    delivery_fee integer not null check (delivery_fee >= 0),
    total integer not null check (total >= 0),
    whatsapp_status text not null default 'not_configured'
        check (whatsapp_status in ('pending', 'sent', 'failed', 'not_configured'))
);

alter table public.orders add column if not exists delivery_area text;
alter table public.orders add column if not exists consented_at timestamptz not null default now();
alter table public.orders add column if not exists status text not null default 'new';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'orders_delivery_area_check'
          and conrelid = 'public.orders'::regclass
    ) then
        alter table public.orders
            add constraint orders_delivery_area_check
            check (
                (fulfilment = 'pickup' and delivery_area is null)
                or (fulfilment = 'delivery' and delivery_area in ('academic_area', 'halls_of_residence', 'private_hostel'))
            ) not valid;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'orders_status_allowed_check'
          and conrelid = 'public.orders'::regclass
    ) then
        alter table public.orders
            add constraint orders_status_allowed_check
            check (status in ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')) not valid;
    end if;
end $$;

alter table public.orders enable row level security;

-- No public/anon policies: only the server-side Netlify Function accesses orders.
