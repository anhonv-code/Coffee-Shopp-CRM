import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Lightweight auth gate. We only check that a valid session cookie exists here
// (Edge runtime). Full user resolution + RBAC happens in server components and
// route handlers via src/lib/auth.ts.
// Public routes: the login screen and the customer-facing online ordering site.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/order", "/api/order"];

function secretKey() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("coffee_session")?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, secretKey());
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
