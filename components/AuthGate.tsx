"use client"

import { useEffect, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { browserDb } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Headphones, Sparkles, BookOpen, Lock, Mail, Loader2, ArrowRight } from "lucide-react"

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
    if (error) setError("登录失败，请检查邮箱和密码是否正确")
    setBusy(false)
  }

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
            <Headphones className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-primary/30 to-sky-400/30 blur-lg -z-10" />
        </div>
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
          正在载入阅读工作台…
        </p>
      </div>
    )
  }

  if (user) return <>{children}</>

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Ambient background glow decoration */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-10 -z-10 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="w-full max-w-md space-y-6">
        {/* Brand identity */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-white shadow-lg shadow-primary/25 ring-1 ring-white/20">
            <Headphones className="h-7 w-7" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white ring-2 ring-background">
              <Sparkles className="h-3 w-3" />
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              言读 <span className="text-primary font-normal text-xl sm:text-2xl">ReadFlow</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              智能文档解析 · 逐句伴读与拟真人声朗读
            </p>
          </div>
        </div>

        {/* Feature Highlights Pills */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card/60 p-2 backdrop-blur-sm">
            <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">Word / PDF / OCR 深度解析</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-card/60 p-2 backdrop-blur-sm">
            <Headphones className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">逐句高亮与多端进度同步</span>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 dark:shadow-black/20 sm:p-8">
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-1 text-left">
              <h2 className="text-lg font-semibold text-foreground">欢迎使用</h2>
              <p className="text-xs text-muted-foreground">请输入管理员邮箱及密码登录</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  账号邮箱
                </label>
                <div className="relative">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  登录密码
                </label>
                <div className="relative">
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive animate-in fade-in"
              >
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl font-medium gap-2 shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在登录…</span>
                </>
              ) : (
                <>
                  <span>进入工作台</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-muted-foreground">
          个人私有化部署 · 基于 Supabase 鉴权与私有加密存储
        </p>
      </div>
    </main>
  )
}
