import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Login() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Login feature coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            This app currently supports registration only. Please create a new account.
          </p>
          <Button onClick={() => navigate('/register')} className="w-full">
            Go to Registration
          </Button>
          <div className="mt-4 text-center">
            <Link to="/register" className="text-sm text-primary-600 hover:text-primary-700">
              Create new account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
