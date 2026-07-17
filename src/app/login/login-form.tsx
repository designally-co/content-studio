"use client";

import { useActionState } from "react";
import {
  loginAction,
  registerFirstUserAction,
  type AuthFormState,
} from "./actions";

export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const action = firstRun ? registerFirstUserAction : loginAction;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      {firstRun && (
        <Field label="Name">
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            className="cs-input"
            placeholder="Your name"
          />
        </Field>
      )}
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="cs-input"
          placeholder="you@designally.co"
        />
      </Field>
      <Field label="Password">
        <input
          name="password"
          type="password"
          autoComplete={firstRun ? "new-password" : "current-password"}
          required
          className="cs-input"
          placeholder={firstRun ? "At least 8 characters" : "••••••••"}
        />
      </Field>

      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="cs-btn-primary w-full">
        {pending
          ? "Please wait…"
          : firstRun
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}
