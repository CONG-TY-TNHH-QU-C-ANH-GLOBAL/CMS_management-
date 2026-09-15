import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";

import { loginWithPasswordFn, meFn } from "@/features/auth/auth.actions";
import { resolveLoginError } from "./login.errors";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect: string; error?: string } => {
    const out: { redirect: string; error?: string } = {
      redirect: typeof search.redirect === "string" ? search.redirect : "/",
    };
    if (typeof search.error === "string") out.error = search.error;
    return out;
  },
  beforeLoad: async ({ search }) => {
    const { user } = await meFn();
    if (user) throw redirect({ to: search.redirect || "/" });
  },
  head: () => ({ meta: [{ title: "Đăng nhập — THG Content OS" }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const login = useServerFn(loginWithPasswordFn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const errorMessage = formError ?? resolveLoginError(search.error);

  const startUrl = `/api/auth/google/start?redirect=${encodeURIComponent(search.redirect || "/")}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      await login({ data: { email, password } });
      // Full navigation so every loader re-runs with the new session cookie.
      window.location.assign(search.redirect || "/");
    } catch (err) {
      // Never render the raw server message — map it through the bounded
      // allowlist so an unexpected string falls back to the generic text.
      const code = err instanceof Error ? err.message : "";
      setFormError(resolveLoginError(code) ?? resolveLoginError("unknown"));
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="grid place-items-center w-10 h-10 rounded-lg bg-gradient-brand shadow-glow">
            <span className="text-white font-bold text-base tracking-tight">T</span>
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[15px] text-foreground">THG Content OS</div>
            <div className="text-[11px] text-muted-foreground">Hệ thống quản trị nội bộ</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 backdrop-blur p-6 shadow-soft">
          <h1 className="text-xl font-semibold tracking-tight text-foreground mb-1">
            Đăng nhập
          </h1>
          <p className="text-sm text-muted-foreground mb-5">
            Đăng nhập bằng tài khoản được cấp quyền.
          </p>

          {errorMessage && (
            <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {errorMessage}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-foreground mb-1.5"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-foreground mb-1.5"
              >
                Mật khẩu
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">hoặc</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <a
            href={startUrl}
            className="w-full h-10 rounded-md border border-input bg-background hover:bg-accent text-sm font-medium text-foreground inline-flex items-center justify-center gap-2.5 transition"
          >
            <GoogleIcon />
            Đăng nhập bằng Google
          </a>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Cần được cấp quyền? Liên hệ quản trị viên hệ thống.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
