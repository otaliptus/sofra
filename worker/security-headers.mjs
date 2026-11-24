export function securityHeaders(scriptAuthorization) {
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self' ${scriptAuthorization} https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' https://upload.wikimedia.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}
