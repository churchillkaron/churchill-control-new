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
  TenantProvider,
} from "@/app/providers/TenantProvider";

export const metadata = {
  title: "Churchill",
  description: "Enterprise Operating Platform",
};

export default async function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body>
        <PlatformProvider>
          <TenantProvider>
            <WorkspaceRuntimeProvider>
              <OrganizationProvider>
                {children}
              </OrganizationProvider>
            </WorkspaceRuntimeProvider>
          </TenantProvider>
        </PlatformProvider>
      </body>
    </html>
  );
}
