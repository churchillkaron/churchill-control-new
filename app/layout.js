export const metadata = {
  title: "Churchill Control System V6",
  description: "Luxury Hospitality Control System",
};

import Navbar from "./Navbar";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">

        {/* Navbar ONLY on app pages */}
        {typeof window !== "undefined" && window.location.pathname !== "/" && (
          <Navbar />
        )}

        {/* Main Content */}
        <main className="pt-24 px-6 max-w-7xl mx-auto">
          {children}
        </main>

      </body>
    </html>
  );
}