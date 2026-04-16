import NavBar from './components/NavBar'

export const metadata = {
  title: 'Churchill Control System',
  description: 'Restaurant Operating System V6',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#0b0b0b',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <NavBar />
        {children}
      </body>
    </html>
  )
}