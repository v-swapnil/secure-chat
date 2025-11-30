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

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

const verifySchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits'),
})

type RegisterFormData = z.infer<typeof registerSchema>
type VerifyFormData = z.infer<typeof verifySchema>

export default function Register() {
  const [step, setStep] = useState<'register' | 'verify'>('register')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deviceId] = useState(() => uuidv4())
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [registeredPassword, setRegisteredPassword] = useState('')
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
      const crypto = new CryptoEngine(deviceId)
      await crypto.init()

      const identityKey = crypto.getPublicIdentityKey()
      const signedPreKey = await crypto.generateSignedPreKey()
      const oneTimePreKeys = await crypto.generatePreKeys(50)

      await authService.register({
        email: data.email,
        password: data.password,
        identityKey,
        deviceId,
        registrationId: Math.floor(Math.random() * 1000000),
      })

      await authService.uploadPreKeys(deviceId, signedPreKey, oneTimePreKeys)

      setRegisteredEmail(data.email)
      setRegisteredPassword(data.password)
      setStep('verify')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const onVerifySubmit = async (data: VerifyFormData) => {
    setLoading(true)
    setError('')

    try {
      await authService.verify(data.code, registeredEmail)

      const response = await authService.login({
        email: registeredEmail,
        password: registeredPassword,
        deviceId,
      })

      const crypto = new CryptoEngine(deviceId)
      await crypto.init()
      const identityKey = crypto.getPublicIdentityKey()

      login(response.userId, response.token, identityKey, deviceId)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed')
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
            {step === 'register' ? 'Create your account' : 'Verify your email'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'register' ? (
            <form onSubmit={handleRegisterSubmit(onRegisterSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="you@example.com"
                  autoComplete="off"
                  className={registerErrors.email ? 'border-destructive' : ''}
                  {...registerForm('email')}
                />
                {registerErrors.email && (
                  <p className="text-sm text-destructive">{registerErrors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={registerErrors.password ? 'border-destructive' : ''}
                  {...registerForm('password')}
                />
                {registerErrors.password && (
                  <p className="text-sm text-destructive">{registerErrors.password.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Must be 8+ characters with uppercase, lowercase, and number
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
                  A verification code has been sent to <strong>{registeredEmail}</strong>
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
