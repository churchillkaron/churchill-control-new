export default function MetricCard({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/35">
            {label}
          </p>

          <p className="mt-3 text-3xl font-light text-white">
            {value}
          </p>
        </div>

        {Icon ? (
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-violet-200">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
