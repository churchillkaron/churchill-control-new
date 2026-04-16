import './globals.css'

export const metadata = {
  title: 'Churchill Control',
  description: 'Control System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}