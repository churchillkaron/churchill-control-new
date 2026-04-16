import "./globals.css";

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
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        {children}
      </body>
    </html>
  );
}