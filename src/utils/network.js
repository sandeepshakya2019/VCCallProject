/**
 * Resolves the primary network base URL (using local IP address instead of localhost)
 */
export function getBaseNetworkUrl() {
  const protocol = window.location.protocol;
  const port = window.location.port ? `:${window.location.port}` : '';
  const hostname = window.location.hostname;

  // If user is already visiting via their IP
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${protocol}//${hostname}${port}`;
  }

  // If accessing on localhost, prefer the configured Network IP from .env
  const configuredIp = import.meta.env.VITE_APP_IP;
  if (configuredIp && configuredIp.trim()) {
    return `${protocol}//${configuredIp.trim()}${port}`;
  }

  return window.location.origin;
}

export function getNetworkIp() {
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return hostname;
  }
  return import.meta.env.VITE_APP_IP || '10.12.191.153';
}
