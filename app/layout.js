import "./globals.css";

import AppShell
from "@/components/AppShell";

import {
  TenantProvider
} from "@/app/providers/TenantProvider";

export default function RootLayout({
  children,
}) {

  return (

    <html lang="en">

      <body>

        <TenantProvider>

          <AppShell>

            {children}

          </AppShell>

        </TenantProvider>

      </body>

    </html>
  );
}