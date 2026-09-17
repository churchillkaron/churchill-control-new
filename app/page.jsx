export const dynamic = "force-dynamic";

import { headers } from "next/headers";

import AvantiqoUniverseHome from "@/components/public/AvantiqoUniverseHome";
import {
  normalizePlatformHostname,
} from "@/lib/platform/context/resolvePlatformHostContext";
import LoginPage from "./login/page";

function isAvantiqoPublicHostname(hostname) {
  return hostname === "avantiqo.ai" || hostname === "www.avantiqo.ai";
}

export default async function RootPage() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = requestHeaders.get("host");
  const hostname = normalizePlatformHostname(forwardedHost || host);

  if (isAvantiqoPublicHostname(hostname)) {
    return <AvantiqoUniverseHome />;
  }

  return <LoginPage />;
}
