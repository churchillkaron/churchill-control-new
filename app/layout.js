import "./globals.css";
import AppShell from "@/app/AppShell";

export const metadata = {
  title: "Churchill Control",
  description: "Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}