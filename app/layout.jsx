export const dynamic = "force-dynamic";

import "./globals.css";

import {
  PlatformProvider,
} from "@/app/providers/PlatformProvider";

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
          {children}
        </PlatformProvider>
      </body>
    </html>
  );
}
