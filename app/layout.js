import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-white bg-black">

        {/* BACKGROUND IMAGE */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        {/* DARK BASE LAYER */}
        <div className="fixed inset-0 z-10 bg-black/70" />

        {/* DEPTH GRADIENT (important for separation) */}
        <div className="fixed inset-0 z-10 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

        {/* CONTENT LAYER */}
        <div className="relative z-20">
          {children}
        </div>

      </body>
    </html>
  );
}