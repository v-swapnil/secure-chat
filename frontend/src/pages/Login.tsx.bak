import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../stores/authStore'
import { authService } from '../services/authService'
import { CryptoEngine } from '../crypto/engine'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const verifySchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits'),
})

type LoginFormData = z.infer<typeof loginSchema>
type VerifyFormData = z.infer<typeof verifySchema>

export default function Login() {
  const [step, setStep] = useState<'login' | 'verify' | 'device-setup'>('login')
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
  const [loginEmail, setLoginEmail] = useState('')
  const [isNewDevice, setIsNewDevice] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const {
    register: loginForm,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const {
    register: verifyForm,
    handleSubmit: handleVerifySubmit,
    formState: { errors: verifyErrors },
  } = useForm<VerifyFormData>({
    resolver: zodResolver(verifySchema),
  })

  const onLoginSubmit = async (data: LoginFormData) => {
    setLoading(true)
    setError('')

    try {
      // Step 1: Send credentials, triggers OTP
      await authService.login({
        email: data.email,
        password: data.password,
      })

      setLoginEmail(data.email)
      setStep('verify')
    } catch (err: any) {
      console.error('Login error:', err)
      const errorMsg = err.response?.data?.error || err.message || 'Login failed'
      setError(`Login failed: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const onVerifySubmit = async (data: VerifyFormData) => {
    setLoading(true)
    setError('')

    try {
      // Step 2: Verify OTP with device_id
      const response = await authService.verifyLogin({
        email: loginEmail,
        code: data.code,
        deviceId,
      })

      // Store token
      localStorage.setItem('auth_token', response.token)
      localStorage.setItem('user_id', response.userId)

      // Check device status
      if (response.isNewDevice) {
        setIsNewDevice(true)
        setStep('device-setup')
        
        // Generate keys for new device
        const crypto = new CryptoEngine(deviceId)
        await crypto.init()
        const identityKey = crypto.getPublicIdentityKey()
        const signedPreKey = await crypto.generateSignedPreKey()
        const oneTimePreKeys = await crypto.generatePreKeys(50)

        // Upload prekeys
        await authService.uploadPreKeys(deviceId, signedPreKey, oneTimePreKeys)

        login(response.userId, response.token, identityKey, deviceId)
        navigate('/dashboard')
      } else {
        // Existing device - load keys from IndexedDB
        const crypto = new CryptoEngine(deviceId)
        await crypto.init()
        const identityKey = crypto.getPublicIdentityKey()

        // Optionally refresh prekeys
        const signedPreKey = await crypto.generateSignedPreKey()
        const oneTimePreKeys = await crypto.generatePreKeys(50)
        await authService.uploadPreKeys(deviceId, signedPreKey, oneTimePreKeys)

        login(response.userId, response.token, identityKey, deviceId)
        navigate('/dashboard')
      }
    } catch (err: any) {
      console.error('Verification error:', err)
      const errorMsg = err.response?.data?.error || err.message || 'Verification failed'
      setError(`Verification failed: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Welcome Back</CardTitle>
          <CardDescription className="text-center">
            {step === 'login' && 'Enter your credentials to access your account'}
            {step === 'verify' && 'Verify your login'}
            {step === 'device-setup' && 'Setting up encryption...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'device-setup' ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">
                {isNewDevice ? 'Setting up new device...' : 'Loading encryption keys...'}
              </p>
            </div>
          ) : step === 'login' ? (
            <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="you@example.com"
                  autoComplete="off"
                  className={loginErrors.email ? 'border-destructive' : ''}
                  {...loginForm('email')}
                />
                {loginErrors.email && (
                  <p className="text-sm text-destructive">{loginErrors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="off"
                  className={loginErrors.password ? 'border-destructive' : ''}
                  {...loginForm('password')}
                />
                {loginErrors.password && (
                  <p className="text-sm text-destructive">{loginErrors.password.message}</p>
                )}
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Sign up
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifySubmit(onVerifySubmit)} className="space-y-4">
              <div className="bg-primary/10 p-4 rounded-md mb-4">
                <p className="text-sm">
                  A verification code has been sent to <strong>{loginEmail}</strong>
                </p>
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
