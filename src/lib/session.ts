// Browser-scoped session id used to scope CSPM data per visitor.
// This is a demo-only mechanism — production deployments should use real auth.
const KEY = 'cspm_session_id';

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
