// Preload (node --import) para desarrollo local.
//
// El driver de Neon calcula el endpoint HTTP a partir del host de DATABASE_URL y le pega
// a `https://.../sql`. En local no existe ese servicio, asi que redirigimos el endpoint
// al proxy local (.cursor/neon-proxy) sin tocar el codigo de la app. Se activa solo si
// esta cargado via NODE_OPTIONS=--import, cosa que hace .cursor/start y los comandos de dev.
import { neonConfig } from '@neondatabase/serverless'

const proxyPort = process.env.NEON_PROXY_PORT ?? '4444'

neonConfig.fetchEndpoint = () => `http://localhost:${proxyPort}/sql`
// El Pool via WebSocket no se usa en la app, pero por las dudas evitamos TLS en local.
neonConfig.useSecureWebSocket = false
neonConfig.poolQueryViaFetch = true
