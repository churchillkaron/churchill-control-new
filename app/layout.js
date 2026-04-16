import "./globals.css";
import Navbar from "./Navbar";

export const metadata = {
  metadataBase: new URL("https://app.churchillkaron.com"),
  title: "Churchill Control System",
  description:
    "Real-time control of revenue, performance, and operations for premium hospitality venues.",
  openGraph: {
    title: "Churchill Control System",
    description: "Command your venue with real-time operational control.",
    url: "https://app.churchillkaron.com",
    siteName: "Churchill",
    images: [
      {
        url: "https://app.churchillkaron.com/preview.jpg",
        width: 1200,
        height: 630,
        alt: "Churchill Control System",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Churchill Control System",
    description: "Command your venue with real-time operational control.",
    images: ["https://app.churchillkaron.com/preview.jpg"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">

        {/* NAVBAR (handles its own visibility) */}
        <Navbar />

        {/* CONTENT */}
        <main className="pt-20">
          {children}
        </main>

      </body>
    </html>
  );
}