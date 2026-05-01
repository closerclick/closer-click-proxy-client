import { buildSignedChannel, getPublicKeyJwk, signData } from './signature.js'

/**
 * Closer Click WebSocket proxy client.
 * Minimal API: connection + token + messages + channels (publish/list/count/disconnect)
 * with ECDSA P-256 signed envelopes.
 *
 * Events emitted:
 *   - 'connect'           ()                          : socket open
 *   - 'token'             (token)                     : token assigned by proxy
 *   - 'disconnect'        ({code, reason})            : socket closed
 *   - 'error'             (errorObj)                  : transport or server error
 *   - 'message'           (from, payload, raw)        : incoming peer message
 *   - 'channel_joined'    (channel, token)            : new peer joined the channel
 *   - 'channel_left'      (channel, token)            : peer unpublished
 *   - 'peer_disconnected' (token, channel?)           : peer dropped (with channel if it was published there)
 *   - 'reconnecting'      (attempt, max)
 *   - 'reconnect_failed'  (attempts)
 */
export class WebSocketProxyClient {
  constructor (options = {}) {
    this.url = options.url || 'wss://proxy.closer.click'
    this.autoReconnect = options.autoReconnect !== false
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5
    this.reconnectDelay = options.reconnectDelay ?? 3000

    this.ws = null
    this.token = null
    this._connected = false
    this._reconnectAttempts = 0
    this._reconnectTimer = null
    this._handlers = new Map()
    this._pending = new Map() // messageId -> { resolve, reject, timer }
    this._nextId = 1
  }

  // ---------- public API ----------

  get isConnected () { return this._connected }

  connect () {
    return new Promise((resolve, reject) => {
      if (this._connected) return resolve(this.token)
      this._connectResolve = resolve
      this._connectReject = reject
      this._open()
    })
  }

  close () {
    this.autoReconnect = false
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close(1000) } catch (_) {}
    }
  }

  on (event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set())
    this._handlers.get(event).add(handler)
    return () => this.off(event, handler)
  }

  off (event, handler) {
    const set = this._handlers.get(event)
    if (set) set.delete(handler)
  }

  /**
   * Send a payload to one or many peer tokens.
   * The payload is JSON-stringified into the envelope's `message` field.
   */
  send (to, payload) {
    const tokens = Array.isArray(to) ? to : [to]
    this._sendRaw({
      to: tokens,
      message: typeof payload === 'string' ? payload : JSON.stringify(payload)
    })
  }

  /** Publish self into a public channel. */
  async publish (channelName) {
    const channel = await buildSignedChannel(channelName)
    return this._request({ type: 'publish', channel }, 'published', 'channel')
  }

  /** Unpublish self from a public channel. */
  async unpublish (channelName) {
    const channel = await buildSignedChannel(channelName)
    return this._request({ type: 'unpublish', channel }, 'unpublished', 'channel')
  }

  /** List the tokens currently in a channel. */
  async list (channelName) {
    const channel = await buildSignedChannel(channelName)
    const res = await this._request({ type: 'list', channel }, 'channel_list', 'channel')
    return res.tokens || []
  }

  /** List public channel names (optionally filtered by prefix). */
  async listChannels (options = {}) {
    const msg = { type: 'list_channels' }
    if (typeof options.prefix === 'string') msg.prefix = options.prefix
    const res = await this._request(msg, 'channels_list')
    return res.channels || []
  }

  /** How many tokens are in a channel right now (no listing). */
  async channelCount (channelName) {
    const res = await this._request(
      { type: 'channel_count', channel: channelName },
      'channel_count', 'channel'
    )
    return res.count || 0
  }

  /** Tear down the logical pair with a peer (both sides get notified). */
  async disconnectFrom (targetToken) {
    return this._request(
      { type: 'disconnect', target: targetToken },
      'disconnect_confirmation', 'target'
    )
  }

  /** Public key in JWK string form, useful as a stable identity. */
  getPublicKey () {
    return getPublicKeyJwk()
  }

  /** Sign arbitrary data with the local private key (base64 signature). */
  sign (data) {
    return signData(data)
  }

  // ---------- internals ----------

  _open () {
    this.ws = new WebSocket(this.url)
    this.ws.addEventListener('open', () => {
      this._connected = true
      this._reconnectAttempts = 0
      this._emit('connect')
    })
    this.ws.addEventListener('message', (ev) => this._handleFrame(ev.data))
    this.ws.addEventListener('error', (err) => {
      this._emit('error', { type: 'transport', error: err })
      if (this._connectReject) {
        this._connectReject(err)
        this._connectResolve = null
        this._connectReject = null
      }
    })
    this.ws.addEventListener('close', (ev) => {
      const wasConnected = this._connected
      this._connected = false
      this._emit('disconnect', { code: ev.code, reason: ev.reason })
      if (wasConnected && this.autoReconnect && ev.code !== 1000) {
        this._scheduleReconnect()
      }
    })
  }

  _scheduleReconnect () {
    if (this._reconnectAttempts >= this.maxReconnectAttempts) {
      this._emit('reconnect_failed', this._reconnectAttempts)
      return
    }
    this._reconnectAttempts++
    this._emit('reconnecting', this._reconnectAttempts, this.maxReconnectAttempts)
    this._reconnectTimer = setTimeout(() => this._open(), this.reconnectDelay)
  }

  _handleFrame (raw) {
    let data
    try { data = JSON.parse(raw) } catch (e) {
      this._emit('error', { type: 'parse_error', error: e })
      return
    }
    const { type } = data
    switch (type) {
      case 'connected':
        this.token = data.token
        this._emit('token', this.token)
        if (this._connectResolve) {
          this._connectResolve(this.token)
          this._connectResolve = null
          this._connectReject = null
        }
        break
      case 'message': {
        const { from, message, timestamp } = data
        let parsed = null
        if (typeof message === 'string') {
          try { parsed = JSON.parse(message) } catch (_) { parsed = null }
        }
        this._emit('message', from, parsed ?? message, { raw: message, timestamp })
        break
      }
      case 'disconnected':
        this._emit('peer_disconnected', data.token, data.channel || null)
        this._resolvePending(data, 'token')
        break
      case 'joined':
        this._emit('channel_joined', data.channel, data.token)
        break
      case 'left':
        this._emit('channel_left', data.channel, data.token)
        break
      case 'published':
      case 'unpublished':
      case 'channel_list':
      case 'channels_list':
      case 'channel_count':
      case 'disconnect_confirmation':
      case 'message_sent':
        this._resolvePending(data, type)
        break
      case 'error':
        this._emit('error', { type: 'server', error: data.error, id: data.id, messageId: data.messageId })
        this._rejectPending(data)
        break
      default:
        this._emit('unknown', data)
    }
  }

  _sendRaw (frame) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }
    this.ws.send(JSON.stringify(frame))
  }

  _request (frame, expectedType, channelKey) {
    return new Promise((resolve, reject) => {
      const id = `req_${this._nextId++}`
      const out = { ...frame, id }
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new Error(`Timeout waiting for ${expectedType}`))
      }, 10000)
      this._pending.set(id, { resolve, reject, timer, expectedType, channelKey })
      try {
        this._sendRaw(out)
      } catch (e) {
        clearTimeout(timer)
        this._pending.delete(id)
        reject(e)
      }
    })
  }

  _resolvePending (data, actualType) {
    const id = data.id
    if (!id || !this._pending.has(id)) return
    const entry = this._pending.get(id)
    if (entry.expectedType && entry.expectedType !== actualType) return
    clearTimeout(entry.timer)
    this._pending.delete(id)
    entry.resolve(data)
  }

  _rejectPending (data) {
    const id = data.id
    if (!id || !this._pending.has(id)) return
    const entry = this._pending.get(id)
    clearTimeout(entry.timer)
    this._pending.delete(id)
    entry.reject(new Error(data.error || 'Server error'))
  }

  _emit (event, ...args) {
    const set = this._handlers.get(event)
    if (!set) return
    for (const h of set) {
      try { h(...args) } catch (e) { console.error('handler error', e) }
    }
  }
}
