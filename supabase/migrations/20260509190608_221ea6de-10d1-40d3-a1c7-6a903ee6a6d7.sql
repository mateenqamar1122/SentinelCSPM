-- Add per-connection ingest token used to authenticate inbound webhook calls
ALTER TABLE public.siem_connections
  ADD COLUMN IF NOT EXISTS ingest_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS siem_connections_ingest_token_key
  ON public.siem_connections(ingest_token);

-- Dedupe alerts per connection by external id (when SIEM provides one)
CREATE UNIQUE INDEX IF NOT EXISTS soc_alerts_dedupe_external
  ON public.soc_alerts(siem_connection_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS soc_alerts_user_received_idx
  ON public.soc_alerts(user_id, received_at DESC);