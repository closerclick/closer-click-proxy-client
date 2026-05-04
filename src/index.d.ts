export interface WebSocketProxyClientOptions {
  url?: string
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
  /** Enable WebRTC DataChannel transport with proxy fallback. Default true. */
  enableWebRTC?: boolean
  /** Override ICE servers (STUN-only by default). */
  iceServers?: RTCIceServer[]
}

export interface ChannelEntry {
  name: string
  count: number
}

export interface ListChannelsOptions {
  prefix?: string
}

export type ProxyEvent =
  | 'connect'
  | 'token'
  | 'disconnect'
  | 'error'
  | 'message'
  | 'channel_joined'
  | 'channel_left'
  | 'peer_disconnected'
  | 'reconnecting'
  | 'reconnect_failed'
  | 'abuse_notice'
  | 'webrtc_open'
  | 'webrtc_close'
  | 'unknown'

export interface AbuseNotice {
  from: string
  operation: string
  severity: 'soft'
  timestamp: string
}

export class WebSocketProxyClient {
  constructor (options?: WebSocketProxyClientOptions)
  readonly isConnected: boolean
  token: string | null
  connect (): Promise<string>
  close (): void
  on (event: ProxyEvent, handler: (...args: any[]) => void): () => void
  off (event: ProxyEvent, handler: (...args: any[]) => void): void
  send (to: string | string[], payload: any): void
  disconnect (): void
  updateConfig (options: WebSocketProxyClientOptions): void
  publish (channel: string, extraData?: Record<string, any>): Promise<any>
  unpublish (channel: string): Promise<any>
  list (channel: string): Promise<string[]>
  listChannel (channel: string): Promise<string[]>
  listChannels (options?: ListChannelsOptions): Promise<ChannelEntry[]>
  channelCount (channel: string): Promise<number>
  disconnectFrom (targetToken: string): Promise<any>
  sendByPubkey (toPubkeys: string | string[], payload: any): void
  identify (envelope: { data: any; signature: string }): Promise<{ publickey: string; queued_delivered: number }>
  connectWebRTC (token: string): Promise<void>
  isWebRTCOpen (token: string): boolean
  getPublicKey (): Promise<string>
  sign (data: any): Promise<string>
}

export function canonicalStringify (value: any): string
export function getPublicKeyJwk (): Promise<string>
export function signData (data: any): Promise<string>
export function buildSignedChannel (
  channelName: string,
  extraData?: Record<string, any>
): Promise<{ data: { name: string; publickey: string; [k: string]: any }; signature: string }>

export function getWebSocketProxyClient (
  options?: WebSocketProxyClientOptions
): WebSocketProxyClient
