import './globals.css'
import NavBar from './components/NavBar'

export const metadata = {
  title: 'Churchill Control System',
  description: 'Restaurant Operating System V6',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#e6dcc7] text-[#2f2a24] font-sans">

        <NavBar />

        {/* MAIN CONTENT */}
        <main className="pt-20 px-6 max-w-7xl mx-auto">
          {children}
        </main>

        {/* FOOTER */}
        <div className="mt-16 border-t border-[#9f9478] py-6 text-center text-sm text-[#6b6458]">
          © {new Date().getFullYear()} Churchill Control System — Built for precision, performance, and profit.
        </div>

      </body>
    </html>
  )
}