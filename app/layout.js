export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <h1 style={{ color: "red" }}>LAYOUT WORKING</h1>
        {children}
      </body>
    </html>
  );
}