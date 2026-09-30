import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: pages still verify the session against the database.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sid")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next|sw.js|manifest.webmanifest|pwa-icon|favicon.ico).*)"],
};
