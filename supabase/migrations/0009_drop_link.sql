-- 0009_drop_link.sql — remove a feature de vínculo de transferência (abandonada).
-- A consolidação passou a ser por família de título na interface.
update public.investments set merged_into = null where merged_into is not null;
alter table public.investments drop column if exists merged_into;
