# @gatoseya/closer-click-proxy-client

Cliente WebSocket para el proxy de Closer Click. Maneja la conexión, el token efímero, mensajes peer-to-peer y canales públicos firmados con ECDSA P-256.

## Instalación

```bash
npm install @gatoseya/closer-click-proxy-client
```

## Uso

```js
import { WebSocketProxyClient } from '@gatoseya/closer-click-proxy-client'

const client = new WebSocketProxyClient({ url: 'wss://proxy.closer.click' })

client.on('token', (token) => console.log('mi token:', token))
client.on('message', (from, payload) => console.log('de', from, ':', payload))
client.on('channel_joined', (channel, token) => console.log(token, 'entró a', channel))
client.on('channel_left', (channel, token) => console.log(token, 'salió de', channel))

await client.connect()

// Publicar en un canal público (firmado con tu clave local)
await client.publish('chat_room_general')

// Listar miembros y canales
const tokens = await client.list('chat_room_general')
const channels = await client.listChannels({ prefix: 'chat_room_' })
const count = await client.channelCount('chat_room_general')

// Mensaje directo
client.send(['ABCD'], { type: 'hello', text: 'hi' })

// Cerrar pair lógico
await client.disconnectFrom('ABCD')
```

## Identidad

Cada navegador genera y persiste un par ECDSA P-256 en `localStorage` (`closer-click.proxy-client.keypair`). La pública se incluye en cada operación de canal y sirve como identidad estable entre sesiones (no entre apps con orígenes distintos — para eso usa la librería de identidad).

```js
const pubkeyJwk = await client.getPublicKey()
const signature = await client.sign({ msg: 'hola' })
```

## Eventos

| evento              | argumentos                       |
|---------------------|----------------------------------|
| `connect`           | —                                |
| `token`             | `(token)`                        |
| `disconnect`        | `({ code, reason })`             |
| `error`             | `(error)`                        |
| `message`           | `(from, payload, { raw, ts })`   |
| `channel_joined`    | `(channel, token)`               |
| `channel_left`      | `(channel, token)`               |
| `peer_disconnected` | `(token, channel?)`              |
| `reconnecting`      | `(attempt, maxAttempts)`         |
| `reconnect_failed`  | `(attempts)`                     |
| `abuse_notice`      | `({ from, operation, severity, timestamp })` — el proxy avisa que `from` está enviando demasiado. Las apps pueden penalizar el ranking de ese token. |

## Diseño

- Sin heartbeat ni polling de respaldo: cada app decide su política.
- Reconexión simple con backoff fijo (configurable).
- Las operaciones de canal devuelven `Promise` (timeout 10s).
- La firma usa JSON canónico (claves ordenadas) para que el proxy verifique con la misma representación.

## Licencia

MIT
