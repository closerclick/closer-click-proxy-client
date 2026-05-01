export interface WebSocketProxyClientOptions {
  url?: string
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
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
  | 'unknown'

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
