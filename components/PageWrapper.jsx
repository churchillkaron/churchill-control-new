export default function PageWrapper({ title, subtitle, children }) {
  return (
    <div className="page">

      {/* HEADER */}
      <div className="page-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      {/* CONTENT */}
      <div className="space-y-6">
        {children}
      </div>

    </div>
  );
}