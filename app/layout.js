import "./globals.css";
import NavBar from "./components/NavBar";

export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant Operating System V6",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#1c1a17] text-[#f5f1e8] min-h-screen">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
