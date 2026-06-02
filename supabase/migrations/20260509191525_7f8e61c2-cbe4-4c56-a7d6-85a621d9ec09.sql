CREATE UNIQUE INDEX IF NOT EXISTS soc_alerts_conn_extid_unique
  ON public.soc_alerts (siem_connection_id, external_id);