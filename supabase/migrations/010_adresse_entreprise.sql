-- CommPro v2 — Migration 010 : adresse de l'entreprise (en-tête des reçus et des relevés).
alter table public.tenants add column adresse text;
grant update (adresse) on public.tenants to authenticated;  -- le plan, lui, reste non modifiable depuis l'application
