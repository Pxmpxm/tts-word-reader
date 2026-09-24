"use client"

import { useEffect, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { browserDb } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const db = browserDb()
    db.auth.getUser().then(({ data }) => { setUser(data.user); setChecking(false) })
      .catch(() => setChecking(false))
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const { error } = await browserDb().auth.signInWithPassword({ email, password })
    if (error) setError("登录失败，请检查邮箱和密码")
    setBusy(false)
  }

  if (checking) return <div className="flex min-h-screen items-center justify-center">正在检查登录状态…</div>
  if (user) return <>{children}</>
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <form onSubmit={signIn} className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-8 shadow-lg">
        <h1 className="text-2xl font-semibold">文档朗读</h1>
        <p className="text-sm text-muted-foreground">使用 Supabase 账号登录。</p>
        <label className="block text-sm">邮箱
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border bg-background p-2" />
        </label>
        <label className="block text-sm">密码
          <input type="password" autoComplete="current-password" required value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border bg-background p-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "登录中…" : "登录"}</Button>
      </form>
    </main>
  )
}
