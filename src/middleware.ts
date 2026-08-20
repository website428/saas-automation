import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/p\/([a-z0-9-]+)\/?$/i);
  if (!match) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("page", match[1].toLowerCase());
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/p/:path*"] };
