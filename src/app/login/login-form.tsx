"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-coffee-700">
          Email
        </label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue="admin@coffeeshopp.com"
          className="input"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-coffee-700">
          Password
        </label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue="password123"
          className="input"
          required
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
