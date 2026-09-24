"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarClock, RefreshCw, Repeat2 } from "lucide-react";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month) {
  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    start,
    end: end.toISOString().slice(0, 10),
  };
}

function overlapsMonth(row, bounds) {
  const start = String(row?.start_date || row?.shift_date || "");
  const end = String(row?.end_date || row?.shift_date || start);
  return Boolean(start && end && start <= bounds.end && end >= bounds.start);
}

function staffName(staffById, id) {
  const row = staffById.get(id);
  return row?.name || row?.email || "Staff";
}

export default function SchedulingLayout({ children }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const organizationId = String(params?.organizationId || "").trim();
  const monthParam = searchParams.get("month");
  const month = /^\d{4}-\d{2}$/.test(String(monthParam || ""))
    ? monthParam
    : currentMonth();
  const bounds = useMemo(() => monthBounds(month), [month]);

  const [context, setContext] = useState({
    loading: true,
    error: "",
    timeOffRequests: [],
    swapRequests: [],
    staff: [],
  });

  const loadContext = useCallback(async () => {
    if (!organizationId) return;

    setContext((current) => ({ ...current, loading: true, error: "" }));

    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(
        `/api/people/workforce/requests?${query.toString()}`,
        { cache: "no-store" }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load workforce requests");
      }

      setContext({
        loading: false,
        error: "",
        timeOffRequests: payload.timeOffRequests || [],
        swapRequests: payload.swapRequests || [],
        staff: payload.staff || [],
      });
    } catch (error) {
      setContext((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Unable to load workforce requests",
      }));
    }
  }, [organizationId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const staffById = useMemo(
    () => new Map(context.staff.map((row) => [row.id, row])),
    [context.staff]
  );

  const timeOff = useMemo(
    () =>
      context.timeOffRequests.filter(
        (row) =>
          ["PENDING", "APPROVED"].includes(String(row?.status || "").toUpperCase()) &&
          overlapsMonth(row, bounds)
      ),
    [context.timeOffRequests, bounds]
  );

  const swaps = useMemo(
    () =>
      context.swapRequests.filter(
        (row) =>
          ["PENDING_TARGET", "PENDING_MANAGER"].includes(
            String(row?.status || "").toUpperCase()
          ) && overlapsMonth(row, bounds)
      ),
    [context.swapRequests, bounds]
  );

  const pendingLeave = timeOff.filter((row) => row.status === "PENDING");
  const approvedLeave = timeOff.filter((row) => row.status === "APPROVED");

  return (
    <>
      <div className="bg-[#F7F6F3] px-5 pt-5 text-[#191919] lg:px-8 lg:pt-8">
        <section className="mx-auto max-w-7xl rounded-[26px] border border-black/[0.08] bg-[#FBF8F3] p-4 lg:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#D6A66A]">
                <CalendarClock className="h-4 w-4" /> Workforce context · {month}
              </div>
              <p className="mt-2 text-sm text-[#746E66]">
                Approved leave blocks new roster rows. Pending leave and open swaps remain visible here before you publish or change schedules.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ContextBadge label="Pending leave" value={pendingLeave.length} />
              <ContextBadge label="Approved leave" value={approvedLeave.length} />
              <ContextBadge label="Open swaps" value={swaps.length} />
              <button
                type="button"
                onClick={loadContext}
                disabled={context.loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#746E66] disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${context.loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <Link
                href={`/workspace/${organizationId}/people/requests`}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D6A66A] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-black"
              >
                Review requests <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {context.error ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {context.error}
            </div>
          ) : null}

          {!context.loading && (timeOff.length || swaps.length) ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                {timeOff.slice(0, 6).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#F7F6F3]/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-[#4F4A45]">
                        {staffName(staffById, row.staff_id)} · {row.leave_type || "Time off"}
                      </div>
                      <div className="mt-1 text-[10px] text-[#918B83]">
                        {row.start_date} → {row.end_date}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${
                        row.status === "APPROVED"
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                          : "border-amber-400/25 bg-amber-400/10 text-amber-100"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {swaps.slice(0, 6).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#F7F6F3]/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 truncate text-xs font-black text-[#4F4A45]">
                        <Repeat2 className="h-3.5 w-3.5 shrink-0 text-amber-300/70" />
                        {staffName(staffById, row.requester_staff_id)} → {staffName(staffById, row.target_staff_id)}
                      </div>
                      <div className="mt-1 text-[10px] text-[#918B83]">
                        {row.shift_date} · {row.start_time}–{row.end_time}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-amber-100">
                      {String(row.status || "").replaceAll("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {children}
    </>
  );
}

function ContextBadge({ label, value }) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-[#F7F6F3]/20 px-3 py-2 text-center">
      <div className="text-[9px] uppercase tracking-[0.12em] text-[#A19A92]">{label}</div>
      <div className="mt-1 text-sm font-black text-[#4F4A45]">{value}</div>
    </div>
  );
}
