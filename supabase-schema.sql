-- Corona Summer Opening — esquema mínimo (armazenamento chave/valor em JSONB)
-- Rode isso uma vez no SQL Editor do Supabase (ou via migration) antes do primeiro deploy.

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: bloqueia acesso via chave anônima/pública.
-- As funções serverless usam a service role key (bypassa RLS), então isso é só uma trava extra.
alter table kv_store enable row level security;
