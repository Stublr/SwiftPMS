import { useState } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { PinLoginForm } from "@/components/auth/pin-login-form";

type LoginMode = "email" | "pin";

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<LoginMode>("email");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-white p-8 shadow-sm">
        {/* Logo */}
        <div className="text-center">
          <div className="bg-primary mx-auto flex h-14 w-14 items-center justify-center rounded-xl">
            <span className="text-2xl font-bold text-white">S</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold">SwiftPMS</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in to your account
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-secondary p-1">
          <button
            onClick={() => setMode("email")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "email"
                ? "bg-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Email Login
          </button>
          <button
            onClick={() => setMode("pin")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "pin"
                ? "bg-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            PIN Login
          </button>
        </div>

        {/* Form */}
        {mode === "email" ? (
          <LoginForm onSuccess={onSuccess} />
        ) : (
          <PinLoginForm onSuccess={onSuccess} />
        )}

        {/* Demo credentials hint */}
        <div className="border-border rounded-md border bg-slate-50 p-3 text-xs text-muted-foreground">
          <p className="font-medium">Demo credentials:</p>
          <p>Email: admin@demo.com</p>
          <p>Password: password123 | PIN: 1234</p>
        </div>
      </div>
    </div>
  );
}
