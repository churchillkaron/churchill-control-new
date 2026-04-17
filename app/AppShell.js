export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">

      {/* 🔥 FIXED BACKGROUND */}
      <div className="fixed inset-0 -z-20">
        <img
          src="/bg-beach.jpg"
          alt="Background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* 🔥 DARK OVERLAY */}
      <div className="fixed inset-0 -z-10 bg-black/70 backdrop-blur-[2px]" />

      {/* 🔥 CONTENT LAYER (THIS CREATES DEPTH) */}
      <div className="relative z-10 pt-28 px-6 max-w-7xl mx-auto">

        {/* subtle gradient floor (premium trick) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60 pointer-events-none rounded-none" />

        <div className="relative">
          {children}
        </div>

      </div>
    </div>
  );
}