import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { authService } from '../services/authService'
import { wsService } from '../services/websocketService'
import { CryptoEngine, hashQuestionnaireAnswers } from '../crypto/engine'
import type { Message } from '../types'
import { v4 as uuidv4 } from 'uuid'

const QUESTIONS = [
  { id: 'interests', question: 'What are your main interests?', options: ['Technology', 'Sports', 'Arts', 'Science', 'Music'] },
  { id: 'age_group', question: 'Age group', options: ['18-25', '26-35', '36-45', '46+'] },
  { id: 'topic', question: 'What would you like to talk about?', options: ['Casual chat', 'Deep conversation', 'Debate', 'Fun & games'] },
]

type MatchState = 'questionnaire' | 'searching' | 'matched' | 'chatting'

export default function RandomChat() {
  const navigate = useNavigate()
  const { userId, token, deviceId } = useAuthStore()
  const { currentSessionId, sessions, addMessage, createSession } = useChatStore()
  const [matchState, setMatchState] = useState<MatchState>('questionnaire')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [crypto, setCrypto] = useState<CryptoEngine | null>(null)
  const [partnerKey, setPartnerKey] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (deviceId) {
      const engine = new CryptoEngine(deviceId)
      engine.init().then(() => setCrypto(engine))
    }
  }, [deviceId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessions, currentSessionId])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
  }

  const handleStartMatching = async () => {
    if (!crypto || !userId || !token || !deviceId) return

    try {
      // Ensure WebSocket is connected (should already be connected from Dashboard)
      if (!wsService.isConnected()) {
        await wsService.connect(token, deviceId)
      }
      wsService.on('message', handleIncomingMessage)
      
      // Use simple tag hash for matching
      const tagHashes = hashQuestionnaireAnswers(answers)
      const tagHash = tagHashes.join(',') // Combine into single string

      await authService.joinMatchQueue(tagHash)
      setMatchState('searching')

      // Poll for match
      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const status = await authService.getMatchStatus()
          if (status.status === 'matched' && status.pair_id) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)

            // Fetch partner's key bundle
            const keyBundle = await authService.getKeyBundle(status.pair_id)
            setPartnerKey(keyBundle.identity_pub)
            createSession(status.pair_id, keyBundle.identity_pub, true)
            setMatchState('matched')

            // Transition to chatting immediately
            setTimeout(() => setMatchState('chatting'), 1000)
          }
        } catch (error) {
          console.error('Error polling match status:', error)
        }
      }, 2000)

      // Stop polling after 60 seconds
      timeoutRef.current = window.setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        if (matchState === 'searching') {
          handleCancelMatch()
        }
      }, 60000)
    } catch (error) {
      console.error('Failed to join queue:', error)
    }
  }

  const handleCancelMatch = async () => {
    try {
      // Clear polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      // Leave queue on backend
      await authService.leaveMatchQueue()
      setMatchState('questionnaire')
    } catch (error) {
      console.error('Failed to cancel match:', error)
      setMatchState('questionnaire')
    }
  }

  const handleIncomingMessage = async (data: any) => {
    if (!crypto || !partnerKey || !currentSessionId) return

    try {
      // Message from backend_new format: { type: 'message', from: userId, payload: encrypted, timestamp }
      const decrypted = await crypto.decryptMessage(data.payload, partnerKey)
      const msg: Message = {
        id: uuidv4(),
        from: data.from,
        to: userId!,
        content: decrypted,
        timestamp: data.timestamp || Date.now(),
        type: 'text',
      }
      addMessage(currentSessionId, msg)
    } catch (error) {
      console.error('Failed to decrypt message:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!message.trim() || !crypto || !partnerKey || !currentSessionId || !userId) return

    try {
      const encrypted = await crypto.encryptMessage(message, partnerKey)

      const msg: Message = {
        id: uuidv4(),
        from: userId,
        to: currentSessionId,
        content: message,
        timestamp: Date.now(),
        type: 'text',
      }

      addMessage(currentSessionId, msg)

      // Send via WebSocket using new format
      wsService.sendMessage(currentSessionId, encrypted)

      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleEndChat = async () => {
    try {
      await authService.leaveMatchQueue()
      // Don't disconnect WebSocket - keep it alive for the session
      // Clear message handler for this chat
      wsService.off('message')
      navigate('/dashboard')
    } catch (error) {
      console.error('Failed to end chat:', error)
    }
  }

  const currentSession = currentSessionId ? sessions.get(currentSessionId) : null

  if (matchState === 'questionnaire') {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-gray-600 hover:text-gray-900"
                >
                  ← Back
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Random Match Chat</h1>
          <p className="text-gray-600 mb-8">Answer a few questions to find your match</p>

          <div className="space-y-6">
            {QUESTIONS.map((q) => (
              <div key={q.id} className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold text-gray-800 mb-4">{q.question}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {q.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleAnswerChange(q.id, option)}
                      className={`p-3 rounded-lg border-2 transition ${answers[q.id] === option
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleStartMatching}
            disabled={Object.keys(answers).length < QUESTIONS.length}
            className="w-full mt-8 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Start Matching
          </button>
        </div>
      </div>
    )
  }

  if (matchState === 'searching') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Searching for a match...</h2>
          <p className="text-gray-600">This may take a moment</p>
          <button
            onClick={handleCancelMatch}
            className="mt-8 px-6 py-2 text-gray-600 hover:text-gray-800 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (matchState === 'matched') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Match found!</h2>
          <p className="text-gray-600">Establishing secure connection...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-lg font-semibold text-gray-800">Anonymous Chat</span>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleEndChat}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                End Chat
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentSession?.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.from === userId ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.from === userId
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-800 shadow'
                }`}
            >
              <p>{msg.content}</p>
              <span className="text-xs opacity-75">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t p-4">
        <div className="max-w-4xl mx-auto flex space-x-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={handleSendMessage}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
