import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-coffee-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-coffee-600 text-3xl">
            ☕
          </div>
          <h1 className="text-2xl font-bold text-coffee-900">Coffee Shopp CRM</h1>
          <p className="text-sm text-coffee-500">
            Sign in to your management console
          </p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>

        <div className="mt-4 rounded-lg bg-white/60 p-3 text-center text-xs text-coffee-500">
          Demo accounts (password: <b>password123</b>):
          <br />
          admin@ · manager@ · barista@coffeeshopp.com
        </div>
      </div>
    </main>
  );
}
