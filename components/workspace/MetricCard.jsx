export default function MetricCard({
  label,
  title,
  value,
  subtitle,
  icon: Icon,
}) {
  const resolvedLabel = label || title || "Metric";

  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_6px_22px_rgba(31,27,20,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">
            {resolvedLabel}
          </p>

          <p className="mt-3 text-[28px] font-medium tracking-[-0.035em] text-[#1C1B19]">
            {value ?? 0}
          </p>

          {subtitle ? (
            <p className="mt-1.5 text-[11px] leading-5 text-[#98948C]">
              {subtitle}
            </p>
          ) : null}
        </div>

        {Icon ? (
          <div className="rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] p-3 text-[#9A744B]">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}