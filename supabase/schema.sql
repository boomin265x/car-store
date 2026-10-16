create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    category text not null check (category in ('wheels', 'audio', 'exterior', 'interior', 'tint', 'lights')),
    description text not null,
    compatibility text not null,
    stock integer not null default 0 check (stock >= 0),
    meta text not null,
    price bigint not null check (price >= 0),
    badge text not null default '',
    image text not null,
    created_at timestamptz not null default now()
);

alter table public.products enable row level security;

insert into public.products (name, category, description, compatibility, stock, meta, price, badge, image)
values
    ('Apex RS-7', 'wheels', 'Lightweight forged wheels with a sharp satin finish.', 'Universal fitment', 12, '18 x 8.5 / Satin black', 899000, 'Best seller', 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=700&q=80'),
    ('Lowline Splitter', 'exterior', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, 'Gloss carbon / universal', 245000, 'New', 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=700&q=80'),
    ('Pulse 10 Subwoofer', 'audio', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, '10 inch / 600 watts', 329000, '', 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=80'),
    ('Nightshift Film', 'tint', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, '35% / 20 in x 10 ft', 74000, '', 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=700&q=80'),
    ('Forge 5 Spoke', 'wheels', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, '19 x 9 / Gunmetal', 1120000, '', 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=700&q=80'),
    ('Streetline Spoiler', 'exterior', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, 'ABS / paint-ready', 390000, '', 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=700&q=80'),
    ('Arc 2-Way Kit', 'audio', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, '6.5 inch / component', 189000, '', 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=700&q=80'),
    ('Solarblock 05', 'tint', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, '5% / 24 in x 10 ft', 86000, '', 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=700&q=80'),
    ('Lumen Pro LED Kit', 'lights', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, '6000K / plug and play', 145000, 'New', 'https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&w=700&q=80'),
    ('Heritage Shift Kit', 'interior', 'Premium upgrade selected for fit, function, and finish.', 'Check vehicle fitment', 10, 'Leather / brushed alloy', 185000, '', 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=700&q=80')
on conflict (name) do nothing;

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    reference text not null unique,
    customer_name text not null,
    customer_phone text not null,
    delivery_address text not null,
    payment_method text not null check (payment_method in ('Mobile Money', 'Bank transfer', 'Cash on delivery')),
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'fulfilled')),
    subtotal bigint not null default 0 check (subtotal >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    product_name text not null,
    unit_price bigint not null check (unit_price >= 0),
    quantity integer not null check (quantity > 0),
    line_total bigint not null check (line_total >= 0)
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
grant select, insert, update, delete on public.products, public.orders, public.order_items to service_role;

create or replace function public.create_order(
    p_customer_name text,
    p_customer_phone text,
    p_delivery_address text,
    p_payment_method text,
    p_items jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_order_id uuid;
    v_reference text;
    v_item jsonb;
    v_product_id uuid;
    v_quantity integer;
    v_product record;
    v_subtotal bigint := 0;
    v_line_total bigint;
    v_product_ids uuid[] := array[]::uuid[];
begin
    if jsonb_typeof(p_items) is distinct from 'array' then
        raise exception 'Order items must be a list.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
        raise exception 'An order must contain between 1 and 20 products.' using errcode = '22023';
    end if;

    for v_item in select value from jsonb_array_elements(p_items) loop
        begin
            v_product_id := (v_item->>'product_id')::uuid;
            v_quantity := (v_item->>'quantity')::integer;
        exception when others then
            raise exception 'An order item is invalid.' using errcode = '22023';
        end;
        if v_quantity < 1 or v_quantity > 99 or v_product_id = any(v_product_ids) then
            raise exception 'An order item quantity is invalid or duplicated.' using errcode = '22023';
        end if;
        v_product_ids := array_append(v_product_ids, v_product_id);
    end loop;

    -- Acquire product locks in a consistent order so concurrent checkouts do not oversell stock.
    perform p.id from public.products p where p.id = any(v_product_ids) order by p.id for update;

    v_reference := 'AC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.orders (reference, customer_name, customer_phone, delivery_address, payment_method)
    values (v_reference, p_customer_name, p_customer_phone, p_delivery_address, p_payment_method)
    returning id into v_order_id;

    for v_item in select value from jsonb_array_elements(p_items) loop
        v_product_id := (v_item->>'product_id')::uuid;
        v_quantity := (v_item->>'quantity')::integer;
        select p.id, p.name, p.price, p.stock into v_product
        from public.products p where p.id = v_product_id;
        if not found then
            raise exception 'A selected upgrade is no longer available.' using errcode = 'P0001';
        end if;
        if v_product.stock < v_quantity then
            raise exception 'Only % of % remain in stock.', v_product.stock, v_product.name using errcode = 'P0001';
        end if;

        v_line_total := v_product.price * v_quantity;
        v_subtotal := v_subtotal + v_line_total;
        update public.products set stock = stock - v_quantity where id = v_product_id;
        insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
        values (v_order_id, v_product.id, v_product.name, v_product.price, v_quantity, v_line_total);
    end loop;

    update public.orders set subtotal = v_subtotal where id = v_order_id;
    return jsonb_build_object(
        'id', v_order_id,
        'reference', v_reference,
        'status', 'pending',
        'subtotal', v_subtotal,
        'items', (select jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'lineTotal', oi.line_total)) from public.order_items oi where oi.order_id = v_order_id)
    );
end;
$$;

revoke all on function public.create_order(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, text, jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
