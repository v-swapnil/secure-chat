import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../stores/authStore'
import { authService } from '../services/authService'
import { SecureCryptoEngine } from '../crypto/engineSecure'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const registerSchema = z.object({
  identifier: z.string().min(3, 'Identifier must be at least 3 characters'),
})

const verifySchema = z.object({
  code: z.string().length(6, 'OTP code must be 6 characters'),
})

type RegisterFormData = z.infer<typeof registerSchema>
type VerifyFormData = z.infer<typeof verifySchema>

export default function Register() {
  const [step, setStep] = useState<'register' | 'verify' | 'uploading-keys'>('register')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deviceId] = useState(() => {
    // Check localStorage first, generate if not exists
    const stored = localStorage.getItem('device_id')
    if (stored) return stored
    const newId = uuidv4()
    localStorage.setItem('device_id', newId)
    return newId
  })
  const [registeredIdentifier, setRegisteredIdentifier] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const {
    register: registerForm,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const {
    register: verifyForm,
    handleSubmit: handleVerifySubmit,
    formState: { errors: verifyErrors },
  } = useForm<VerifyFormData>({
    resolver: zodResolver(verifySchema),
  })

  const onRegisterSubmit = async (data: RegisterFormData) => {
    setLoading(true)
    setError('')

    try {
      // Step 1: Register with identifier and get OTP
      const response = await authService.register(data.identifier)
      
      setRegisteredIdentifier(data.identifier)
      setOtpCode(response.otp) // In dev, we get OTP back
      setStep('verify')
    } catch (err: any) {
      console.error('Registration error:', err)
      const errorMsg = err.response?.data?.error || err.message || 'Registration failed'
      setError(`Registration failed: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const onVerifySubmit = async (data: VerifyFormData) => {
    setLoading(true)
    setError('')

    try {
      setStep('uploading-keys')

      // Step 2: Generate keys locally
      const crypto = new SecureCryptoEngine(deviceId)
      await crypto.init()
      const identityPubKey = crypto.getPublicIdentityKey()
      const signingPubKey = crypto.getPublicSigningKey()

      // Step 3: Verify 2FA with OTP and identity public key
      const verifyResponse = await authService.verify2FA({
        identifier: registeredIdentifier,
        otp: data.code,
        identity_pubkey: identityPubKey,
      })

      // Store token and user_id
      localStorage.setItem('auth_token', verifyResponse.token)
      localStorage.setItem('user_id', verifyResponse.user_id)

      // Step 4: Generate and upload prekeys
      const signedPreKey = await crypto.generateSignedPreKey()
      const oneTimePreKeys = await crypto.generatePreKeys(50)

      // Create bundle for server
      const bundle = {
        identity_pub: identityPubKey,
        signing_pub: signingPubKey,
        signed_prekey: signedPreKey.publicKey,
        signed_prekey_signature: signedPreKey.signature,
        one_time_prekeys: oneTimePreKeys.map(k => k.publicKey),
        device_id: deviceId,
        device_pubkey: identityPubKey, // Using identity key as device key for now
      }
      
      await authService.uploadPreKeys(bundle)

      login(verifyResponse.user_id, verifyResponse.token, identityPubKey, deviceId)
      navigate('/dashboard')
    } catch (err: any) {
      console.error('Verification error:', err)
      const errorMsg = err.response?.data?.error || err.message || 'Verification failed'
      setError(`Verification failed: ${errorMsg}`)
      setStep('verify') // Go back to verify step on error
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Secure Chat</CardTitle>
          <CardDescription className="text-center">
            {step === 'register' && 'Create your account'}
            {step === 'verify' && 'Verify your email'}
            {step === 'uploading-keys' && 'Setting up encryption...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'uploading-keys' ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Generating encryption keys...</p>
            </div>
          ) : step === 'register' ? (
            <form onSubmit={handleRegisterSubmit(onRegisterSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Username or Email</Label>
                <Input
                  id="identifier"
                  type="text"
                  placeholder="username or you@example.com"
                  autoComplete="off"
                  className={registerErrors.identifier ? 'border-destructive' : ''}
                  {...registerForm('identifier')}
                />
                {registerErrors.identifier && (
                  <p className="text-sm text-destructive">{registerErrors.identifier.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  This will be used to identify your account
                </p>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Login
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifySubmit(onVerifySubmit)} className="space-y-4">
              <div className="bg-primary/10 p-4 rounded-md mb-4">
                <p className="text-sm">
                  A verification code has been sent to <strong>{registeredIdentifier}</strong>
                </p>
                {otpCode && (
                  <p className="text-sm mt-2 font-mono bg-yellow-100 p-2 rounded">
                    Development OTP: <strong>{otpCode}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="000000"
                  autoComplete="off"
                  maxLength={6}
                  className={`text-center text-2xl tracking-widest ${
                    verifyErrors.code ? 'border-destructive' : ''
                  }`}
                  {...verifyForm('code')}
                />
                {verifyErrors.code && (
                  <p className="text-sm text-destructive">{verifyErrors.code.message}</p>
                )}
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
