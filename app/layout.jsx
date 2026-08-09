export const dynamic = "force-dynamic";

import { headers } from "next/headers";

import "./globals.css";

import {
  OrganizationProvider,
} from "@/app/providers/OrganizationProvider";

import {
  PlatformProvider,
} from "@/app/providers/PlatformProvider";

import {
  WorkspaceRuntimeProvider,
} from "@/app/providers/WorkspaceRuntimeProvider";

import {
  BusinessContextProvider,
} from "@/app/providers/BusinessContextProvider";

import {
  normalizePlatformHostname,
} from "@/lib/platform/context/resolvePlatformHostContext";
import {
  resolveRegisteredPlatformHostContext,
} from "@/lib/platform/context/resolveRegisteredPlatformHostContext";

export const metadata = {
  title: "Avantiqo | Business Operating System",
  description:
    "Avantiqo is a multi-tenant Business Operating System for organizations, workflows, approvals, AI automation and connected business services.",
};

function safeBootstrapJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function RootLayout({
  children,
}) {
  const requestHeaders = await headers();
  const hostname = normalizePlatformHostname(
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  );

  let hostContext = null;

  try {
    hostContext = await resolveRegisteredPlatformHostContext(hostname);
  } catch (error) {
    console.error("PLATFORM_HOST_BOOTSTRAP_ERROR", error);
  }

  const hostBootstrap = hostContext
    ? {
        hostname,
        context: hostContext,
      }
    : null;

  return (
    <html lang="en">
      <body>
        {hostBootstrap ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__AVANTIQO_HOST_CONTEXT__=${safeBootstrapJson(hostBootstrap)};`,
            }}
          />
        ) : null}

        <PlatformProvider>
          <BusinessContextProvider>
            <WorkspaceRuntimeProvider>
              <OrganizationProvider>
                {children}
              </OrganizationProvider>
            </WorkspaceRuntimeProvider>
          </BusinessContextProvider>
        </PlatformProvider>
      </body>
    </html>
  );
}
