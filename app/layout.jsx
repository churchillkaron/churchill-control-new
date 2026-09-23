export const dynamic = "force-dynamic";

import { headers } from "next/headers";

import "./globals.css";

import {
  OrganizationProvider,
} from "@/app/providers/OrganizationProvider";

import {
  WorkspaceRuntimeProvider,
} from "@/app/providers/WorkspaceRuntimeProvider";

import {
  BusinessContextProvider,
} from "@/app/providers/BusinessContextProvider";
import PlatformGlobalFailureObserver from "@/components/platform/self-healing/PlatformGlobalFailureObserver";

import {
  normalizePlatformHostname,
  resolvePlatformHostContext,
} from "@/lib/platform/context/resolvePlatformHostContext";
import {
  resolveRegisteredPlatformHostContext,
} from "@/lib/platform/context/resolveRegisteredPlatformHostContext";

function requestHostname(requestHeaders) {
  return normalizePlatformHostname(
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  );
}

async function requestHostContext(requestHeaders) {
  const hostname = requestHostname(requestHeaders);

  try {
    return {
      hostname,
      context: await resolveRegisteredPlatformHostContext(hostname),
    };
  } catch (error) {
    console.error("PLATFORM_HOST_BOOTSTRAP_ERROR", error);

    return {
      hostname,
      context: resolvePlatformHostContext(hostname),
    };
  }
}

export async function generateMetadata() {
  const requestHeaders = await headers();
  const { context } = await requestHostContext(requestHeaders);
  const brandName = context?.name || "Avantiqo";

  const title = context?.id === "avantiqo"
    ? "Avantiqo | Intelligent Operating Platform"
    : `${brandName} | Business Operating System`;
  const description = context?.workspaceDescription ||
    "Run the business, create finished work, build software and scale workloads from one connected Avantiqo operating context.";

  return {
    metadataBase: new URL(context?.id === "avantiqo" ? "https://avantiqo.ai" : `https://${requestHostname(requestHeaders)}`),
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      siteName: brandName,
      images: [{ url: "/art/commercial-start.jpg", width: 1200, height: 630, alt: `${brandName} operating platform` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/art/commercial-start.jpg"],
    },
  };
}

function safeBootstrapJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function RootLayout({
  children,
}) {
  const requestHeaders = await headers();
  const { hostname, context } = await requestHostContext(requestHeaders);

  const hostBootstrap = context
    ? {
        hostname,
        context,
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

        <BusinessContextProvider>
          <PlatformGlobalFailureObserver />
          <WorkspaceRuntimeProvider>
            <OrganizationProvider>
              {children}
            </OrganizationProvider>
          </WorkspaceRuntimeProvider>
        </BusinessContextProvider>
      </body>
    </html>
  );
}
