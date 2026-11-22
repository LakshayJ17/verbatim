import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { ensureProfile } from '@/utils/auth/profile'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Protect against open redirects
  const next = searchParams.get('next') ?? '/dashboard'
  // Backslashes count too: browsers read "/\evil.com" as "//evil.com".
  const isSafeRedirect = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/[\u0000-\u001f]/.test(next)
  const redirectPath = isSafeRedirect ? next : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error, data: authData } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && authData?.user) {
      // Profile row (also created by the handle_new_user trigger; this is
      // the safety net, with the service role and duplicate-name retries).
      await ensureProfile(authData.user)

      // The session is created and the cookies are set.
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
