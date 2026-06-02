ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_connection_id_fkey;
ALTER TABLE public.scans ALTER COLUMN connection_id DROP NOT NULL;