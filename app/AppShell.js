export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen text-white">

      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <img
          src="/bg-beach.jpg"
          alt="Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      {/* Content */}
      <div className="pt-24 px-6 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
}