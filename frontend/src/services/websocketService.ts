import type { EncryptedMessage } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081'

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private messageHandlers: Map<string, (message: any) => void> = new Map()

  connect(token: string, deviceId: string = 'default'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Backend expects JWT token in Authorization header via WebSocket
        // But WebSocket doesn't support custom headers, so we need to upgrade the HTTP request first
        // For now, we'll rely on the auth middleware checking query params or upgrade later
        const wsUrl = WS_URL.replace('http://', 'ws://').replace('https://', 'wss://')
        this.ws = new WebSocket(`${wsUrl}/api/ws?device_id=${deviceId}&token=${token}`)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('WebSocket closed')
          this.attemptReconnect(token, deviceId)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private attemptReconnect(token: string, deviceId: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`)
      setTimeout(() => {
        this.connect(token, deviceId).catch(console.error)
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }

  private handleMessage(message: any) {
    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      handler(message)
    }
  }

  on(type: string, handler: (message: any) => void) {
    this.messageHandlers.set(type, handler)
  }

  off(type: string) {
    this.messageHandlers.delete(type)
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.error('WebSocket is not connected')
    }
  }

  sendMessage(to: string, payload: string) {
    this.send({
      type: 'message',
      to: to,
      payload: payload,
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.messageHandlers.clear()
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

export const wsService = new WebSocketService()
