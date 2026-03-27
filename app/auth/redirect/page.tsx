import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Post-login redirect gate.
 * GoogleSignInButton sends all users here after OAuth.
 * Admin users (@navomarine.com) go to /admin; everyone else goes to /.
 */
export default async function AuthRedirectPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.email?.endsWith('@navomarine.com')) {
    redirect('/admin')
  }

  redirect('/')
}
