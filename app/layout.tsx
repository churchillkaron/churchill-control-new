export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant control and accounting system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, sans-serif",
          background: "#f5f7fb",
        }}
      >
        {children}
      </body>
    </html>
  );
}