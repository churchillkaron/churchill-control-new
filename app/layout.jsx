export const dynamic = "force-dynamic";

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

export const metadata = {
  title: "Avantiqo | Business Operating System",
  description:
    "Avantiqo is a multi-tenant Business Operating System for organizations, workflows, approvals, AI automation and connected business services.",
};

export default async function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body>
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
