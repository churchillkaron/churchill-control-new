export default function PageWrapper({
  title,
  subtitle,
  children,
  actions,
}) {

  return (

    <div className="space-y-8">

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">

        <div>

          <div className="text-[11px] uppercase tracking-[0.35em] text-white/30 mb-3">
            Churchill Enterprise
          </div>

          <h1
            className="text-6xl leading-none"
            style={{
              fontWeight: 250,
              letterSpacing: "-0.08em",
            }}
          >
            {title}
          </h1>

          {subtitle && (

            <p className="mt-4 text-lg text-white/40 max-w-3xl">
              {subtitle}
            </p>

          )}

        </div>

        {actions && (

          <div className="flex items-center gap-3">
            {actions}
          </div>

        )}

      </div>

      {/* CONTENT */}
      <div className="space-y-6">
        {children}
      </div>

    </div>

  );

}
