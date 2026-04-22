import "./globals.css";
import AppShell from "./components/AppShell";

export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}