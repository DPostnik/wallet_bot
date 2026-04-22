-- accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null check (currency in ('USD', 'USDT', 'PLN')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- exchanges (must exist before transactions references it)
create table exchanges (
  id uuid primary key default gen_random_uuid(),
  from_account_id uuid not null references accounts(id),
  to_account_id uuid not null references accounts(id),
  amount_in numeric not null check (amount_in > 0),
  amount_out numeric not null check (amount_out > 0),
  rate numeric not null check (rate > 0),
  created_at timestamptz default now()
);

-- transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric not null check (amount > 0),
  category text,
  description text,
  image_url text,
  exchange_id uuid references exchanges(id),
  created_at timestamptz default now()
);

-- rates
create table rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  rate numeric not null check (rate > 0),
  updated_at timestamptz default now(),
  unique(from_currency, to_currency)
);

-- Enable RLS (Supabase default, but we use service key so it's bypassed)
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table exchanges enable row level security;
alter table rates enable row level security;
