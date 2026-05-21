export const dynamic = "force-dynamic";

import "./globals.css";

import {
  PlatformProvider,
} from "@/app/providers/PlatformProvider";

import {
  getCurrentUser,
} from "@/lib/auth/getCurrentUser";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

import {
  loadTenantRuntime,
} from "@/lib/platform/runtime/loadTenantRuntime";

import {
  getPlatformRuntime,
} from "@/lib/platform/runtime/getPlatformRuntime";

export const metadata = {

  title:
    "Churchill",

  description:
    "Enterprise Operating Platform",

};

export default async function RootLayout({
  children,
}) {

  const user =
    await getCurrentUser();

  const tenantId =
    await getTenantId();

  const runtimeData =
    await loadTenantRuntime(
      tenantId
    );

  const tenant =

    runtimeData?.tenant ||

    {

      id:
        tenantId,

    };

  const runtimePromise =

    getPlatformRuntime({

      tenant,

      user,

    });

  return (

    <html lang="en">

      <body>

        <PlatformProvider
          runtimePromise={
            runtimePromise
          }
        >

          {children}

        </PlatformProvider>

      </body>

    </html>

  );

}
