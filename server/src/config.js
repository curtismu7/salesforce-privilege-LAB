// Mock / Real (rule 19). The DEFAULT source is Real when it is configured and Mock otherwise; SFPRIV_DEFAULT_SOURCE=mock forces Mock (the Docker image
// sets it, so Real is never on by default in a container). The header toggle switches at run time through POST /api/mode. Real is OWNER-RUN and read-only.
export const SOURCES = ['mock', 'real'];
export const sourceOf = (v) => (SOURCES.includes(v) ? v : null);
export function defaultSource(env = process.env, realConfigured = false) {
  const raw = env.SFPRIV_DEFAULT_SOURCE;
  if (raw !== undefined && raw !== '' && raw !== 'mock' && raw !== 'real' && raw !== 'auto') throw new Error('SFPRIV_DEFAULT_SOURCE must be mock, real or auto');
  if (raw === 'mock') return 'mock';
  if (raw === 'real') return realConfigured ? 'real' : 'mock';
  return realConfigured ? 'real' : 'mock';
}
