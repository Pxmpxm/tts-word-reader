import "server-only"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"

export async function userDb() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values) cookieStore.set(name, value, options)
        },
      },
    },
  )
}

export function adminDb() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error("服务器未配置 SUPABASE_SECRET_KEY")
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function currentUser() {
  const client = await userDb()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
  if (!ownerEmail || data.user.email?.toLowerCase() !== ownerEmail) return null
  return data.user
}
