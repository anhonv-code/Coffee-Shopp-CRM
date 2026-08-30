"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const user = await authenticate(email, password);
  if (!user) {
    return { error: "Invalid email or password." };
  }

  await createSession(user);
  redirect("/dashboard");
}
