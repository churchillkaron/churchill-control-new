import "./globals.css";
import Navbar from "./Navbar";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">

        <Navbar />

        <main className="pt-20">
          {children}
        </main>

      </body>
    </html>
  );
}