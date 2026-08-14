import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-secret-change-me-please-32chars"
);
const COOKIE_NAME = "mathapp_session";

const ROLE_PREFIX: Record<string, string> = {
  "/student": "STUDENT",
  "/teacher": "TEACHER",
  "/parent": "PARENT",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const matchedPrefix = Object.keys(ROLE_PREFIX).find((p) =>
    pathname.startsWith(p)
  );
  if (!matchedPrefix) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const role = payload.role as string;
    if (role !== ROLE_PREFIX[matchedPrefix]) {
      return NextResponse.redirect(new URL(`/${role.toLowerCase()}`, req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/student/:path*", "/teacher/:path*", "/parent/:path*"],
};
