import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Premium Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-white bg-black">{children}</body>
    </html>
  );
}