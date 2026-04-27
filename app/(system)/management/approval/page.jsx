"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../../../AppShell";

const STORAGE_KEYS = {
  attendance: "staff_attendance",
  history: "history",
  rejections: "approval_rejections",
  marketingMisses: "marketing_submission_penalties",
};

const CATEGORY = {
  INVOICE: "invoice",
  ROUTINE: "routine",
  FOOD: "food",
  MARKETING: "marketing",
};

const STATUS = {
  PENDING: "pending",
  APPROVED_MANAGER: "approved_manager",
  ACCOUNTING: "accounting",
  FINAL_APPROVED: "final_approved",
  REJECTED: "rejected",

};

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDepartment(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("en-US")} THB`;
}

function formatDateTime(value) {
  if (!value) return "-";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function getTodayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function getTodayDisplayDate() {
  return new Date().toLocaleDateString("en-GB");
}

function startsWithTodayISO(value) {
  if (!value) return false;
  return String(value).startsWith(getTodayISODate());
}

function getInvoicePreviewUrl(invoice) {
  return (
    invoice?.image_url ||
    invoice?.receipt_url ||
    invoice?.file_url ||
    invoice?.document_url ||
    invoice?.url ||
    null
  );
}

function getInvoicePreviewType(invoice) {
  const url = getInvoicePreviewUrl(invoice);
  if (!url) return null;

  const lower = url.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  return "image";
}

function getCategoryPenaltyMode(category) {
  const normalized = normalizeCategory(category);

  if (normalized === CATEGORY.FOOD) return "team_kitchen_quality";
  if (normalized === CATEGORY.ROUTINE) return "team_department_quality";
  if (normalized === CATEGORY.MARKETING) return "none";
  if (normalized === CATEGORY.INVOICE) return "none";

  return "none";
}

function getCategoryImpact(category, status) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus !== STATUS.REJECTED) return "none";

  if (normalizedCategory === CATEGORY.FOOD) return "kitchen_penalty";
  if (normalizedCategory === CATEGORY.ROUTINE) return "foh_penalty";
  if (normalizedCategory === CATEGORY.MARKETING) return "no_impact";
  if (normalizedCategory === CATEGORY.INVOICE) return "no_impact";

  return "none";
}

function dedupeById(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = `${item?.id || "unknown"}-${item?.source_type || "local"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function createRejectionEntry(asset) {
  const category = normalizeCategory(asset?.category);
  const department = normalizeDepartment(asset?.department);
  const createdAt = new Date().toISOString();

  return {
    id: asset?.id || `${createdAt}-${category}`,
    asset_id: asset?.id || null,
    category,
    department: department || null,
    uploaded_by: asset?.uploaded_by || null,
    note: asset?.note || "",
    penalty_mode: getCategoryPenaltyMode(category),
    impact: getCategoryImpact(category, STATUS.REJECTED),
    rejected_at: createdAt,
    applies_to:
      category === CATEGORY.FOOD
        ? "kitchen_team"
        : category === CATEGORY.ROUTINE
        ? department || "department"
        : "none",
  };
}

function saveRejectionEntry(asset) {
  const category = normalizeCategory(asset?.category);

  if (category !== CATEGORY.FOOD && category !== CATEGORY.ROUTINE) {
    return;
  }

  const existing = safeJsonParse(localStorage.getItem(STORAGE_KEYS.rejections), []);
  const next = [
    ...existing.filter((entry) => String(entry?.asset_id || "") !== String(asset?.id || "")),
    createRejectionEntry(asset),
  ];

  localStorage.setItem(STORAGE_KEYS.rejections, JSON.stringify(next));
}

function removeRejectionEntry(assetId) {
  const existing = safeJsonParse(localStorage.getItem(STORAGE_KEYS.rejections), []);
  const next = existing.filter(
    (entry) => String(entry?.asset_id || "") !== String(assetId || "")
  );
  localStorage.setItem(STORAGE_KEYS.rejections, JSON.stringify(next));
}

function getLatestDay(history) {
  const today = getTodayDisplayDate();
  return history.find((day) => day.date === today) || history[history.length - 1] || null;
}

function getLatestStaffList(latestDay) {
  if (!latestDay?.staff || !Array.isArray(latestDay.staff)) return [];
  return latestDay.staff;
}

function inferMarketingTeamFromStaff(staffList) {
  return staffList.filter((person) => {
    const role = normalizeDepartment(person?.department || person?.role || person?.team);
    return role.includes("marketing");
  });
}

function getMarketingUploadsToday(assets) {
  return assets.filter((asset) => {
    return (
      normalizeCategory(asset?.category) === CATEGORY.MARKETING &&
      startsWithTodayISO(asset?.created_at)
    );
  });
}

function buildMarketingSubmissionPenalties(staffList, assets) {
  const marketingTeam = inferMarketingTeamFromStaff(staffList);
  const uploadsToday = getMarketingUploadsToday(assets);
  const uploaderNames = new Set(
    uploadsToday.map((asset) => normalizeName(asset?.uploaded_by)).filter(Boolean)
  );

  return marketingTeam
    .filter((person) => !uploaderNames.has(normalizeName(person?.name)))
    .map((person) => ({
      id: `marketing-${normalizeName(person?.name)}-${getTodayISODate()}`,
      name: person?.name || "Unknown",
      department: person?.department || person?.role || "marketing",
      reason: "No marketing picture uploaded today",
      impact: "performance",
      created_at: new Date().toISOString(),
      source: "marketing_submission",
    }));
}

export default function ApprovalPage() {
  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [assets, setAssets] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [marketingSubmissionPenalties, setMarketingSubmissionPenalties] = useState([]);

  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [refreshingInvoices, setRefreshingInvoices] = useState(false);
  const [refreshingAssets, setRefreshingAssets] = useState(false);

  const [previewItem, setPreviewItem] = useState(null);
  const [actionLoading, setActionLoading] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadLocalData = useCallback(() => {
    try {
      const nextAttendance = safeJsonParse(
        localStorage.getItem(STORAGE_KEYS.attendance),
        []
      );
      const nextHistory = safeJsonParse(localStorage.getItem(STORAGE_KEYS.history), []);
      const nextRejections = safeJsonParse(
        localStorage.getItem(STORAGE_KEYS.rejections),
        []
      );
      const nextMarketingPenalties = safeJsonParse(
        localStorage.getItem(STORAGE_KEYS.marketingMisses),
        []
      );

      setAttendance(Array.isArray(nextAttendance) ? nextAttendance : []);
      setHistory(Array.isArray(nextHistory) ? nextHistory : []);
      setRejections(Array.isArray(nextRejections) ? nextRejections : []);
      setMarketingSubmissionPenalties(
        Array.isArray(nextMarketingPenalties) ? nextMarketingPenalties : []
      );
    } catch {
      setAttendance([]);
      setHistory([]);
      setRejections([]);
      setMarketingSubmissionPenalties([]);
    }
  }, []);

  // =========================
// FETCH INVOICES (FIXED)
// =========================
const fetchInvoices = useCallback(async () => {
  try {
    setRefreshingInvoices(true);
    setErrorMessage("");

    const url = `/api/invoices/list?t=${Date.now()}`;
    console.log("FETCH INVOICES FROM:", url);

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("INVOICES FETCH FAILED:", res.status);
      setInvoices([]);
      setErrorMessage("Could not load invoices.");
      return;
    }

    const data = await res.json();
    console.log("INVOICES RESPONSE:", data);

    const nextInvoices = data?.invoices || [];

    setInvoices(nextInvoices);

  } catch (error) {
    console.error("INVOICES FETCH ERROR:", error);
    setInvoices([]);
    setErrorMessage("Could not load invoices.");
  } finally {
    setLoadingInvoices(false);
    setRefreshingInvoices(false);
  }
}, []);


// =========================
// FETCH ASSETS (FIXED)
// =========================
const fetchAssets = useCallback(async () => {
  try {
    setRefreshingAssets(true);
    setErrorMessage("");

    const url = `/api/assets/list?t=${Date.now()}`;
    console.log("FETCH ASSETS FROM:", url);

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("ASSETS FETCH FAILED:", res.status);
      setAssets([]);
      setErrorMessage("Could not load assets.");
      return;
    }

    const data = await res.json();
    console.log("ASSETS RESPONSE:", data);

    const nextAssets = data?.assets || [];

    setAssets(nextAssets);

  } catch (error) {
    console.error("ASSETS FETCH ERROR:", error);
    setAssets([]);
    setErrorMessage("Could not load assets.");
  } finally {
    setLoadingAssets(false);
    setRefreshingAssets(false);
  }
}, []);

  useEffect(() => {
    loadLocalData();
    fetchInvoices();
    fetchAssets();
  }, [fetchAssets, fetchInvoices, loadLocalData]);

  useEffect(() => {
    console.log("ASSETS STATE:", assets);
  }, [assets]);

  const latestDay = useMemo(() => getLatestDay(history), [history]);
  const latestStaff = useMemo(() => getLatestStaffList(latestDay), [latestDay]);

  useEffect(() => {
    const penalties = buildMarketingSubmissionPenalties(latestStaff, assets);
    localStorage.setItem(STORAGE_KEYS.marketingMisses, JSON.stringify(penalties));
    setMarketingSubmissionPenalties(penalties);
  }, [assets, latestStaff]);

  const pendingPenalties = useMemo(() => {
    return attendance.filter((item) => item.late && item.status === "pending");
  }, [attendance]);

  const approvedPenalties = useMemo(() => {
    return attendance.filter((item) => item.late && item.status === "approved");
  }, [attendance]);

  const rejectedPenalties = useMemo(() => {
    return attendance.filter((item) => item.late && item.status === "rejected");
  }, [attendance]);

  const pendingSalary = useMemo(() => {
    return latestDay?.staff?.filter((staff) => !staff.approved) || [];
  }, [latestDay]);

  const approvedSalary = useMemo(() => {
    return latestDay?.staff?.filter((staff) => staff.approved) || [];
  }, [latestDay]);

  const pendingApiInvoices = useMemo(() => {
    return invoices.filter((invoice) => normalizeStatus(invoice?.status) === STATUS.PENDING);
  }, [invoices]);

  const apiInvoicesSentToAccounting = useMemo(() => {
    return invoices.filter((invoice) => normalizeStatus(invoice?.status) === STATUS.APPROVED);
  }, [invoices]);

  const finalApprovedApiInvoices = useMemo(() => {
    return invoices.filter((invoice) => normalizeStatus(invoice?.status) === STATUS.APPROVED);
  }, [invoices]);

  const rejectedApiInvoices = useMemo(() => {
    return invoices.filter((invoice) => normalizeStatus(invoice?.status) === STATUS.REJECTED);
  }, [invoices]);

  const invoiceAssetsPending = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.INVOICE &&
        normalizeStatus(asset?.status) === STATUS.PENDING
    );
  }, [assets]);

  const invoiceAssetsSentToAccounting = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.INVOICE &&
        normalizeStatus(asset?.status) === STATUS.APPROVED
    );
  }, [assets]);

  const invoiceAssetsApproved = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.INVOICE &&
        normalizeStatus(asset?.status) === STATUS.APPROVED
    );
  }, [assets]);

  const invoiceAssetsRejected = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.INVOICE &&
        normalizeStatus(asset?.status) === STATUS.REJECTED
    );
  }, [assets]);

  const routineAssetsPending = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.ROUTINE &&
        normalizeStatus(asset?.status) === STATUS.PENDING
    );
  }, [assets]);

  const routineAssetsApproved = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.ROUTINE &&
        normalizeStatus(asset?.status) === STATUS.APPROVED
    );
  }, [assets]);

  const routineAssetsRejected = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.ROUTINE &&
        normalizeStatus(asset?.status) === STATUS.REJECTED
    );
  }, [assets]);

  const foodAssetsPending = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.FOOD &&
        normalizeStatus(asset?.status) === STATUS.PENDING
    );
  }, [assets]);

  const foodAssetsApproved = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.FOOD &&
        normalizeStatus(asset?.status) === STATUS.APPROVED
    );
  }, [assets]);

  const foodAssetsRejected = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.FOOD &&
        normalizeStatus(asset?.status) === STATUS.REJECTED
    );
  }, [assets]);

  const marketingAssetsPending = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.MARKETING &&
        normalizeStatus(asset?.status) === STATUS.PENDING
    );
  }, [assets]);

  const marketingAssetsApproved = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.MARKETING &&
        normalizeStatus(asset?.status) === STATUS.APPROVED
    );
  }, [assets]);

  const marketingAssetsRejected = useMemo(() => {
    return assets.filter(
      (asset) =>
        normalizeCategory(asset?.category) === CATEGORY.MARKETING &&
        normalizeStatus(asset?.status) === STATUS.REJECTED
    );
  }, [assets]);

  const normalizedPendingInvoices = useMemo(() => {
    const apiItems = pendingApiInvoices.map((invoice) => ({
      ...invoice,
      source_type: "invoice_api",
    }));

    const assetItems = invoiceAssetsPending.map((asset) => ({
      id: asset.id,
      vendor: asset.note || "Staff Invoice Upload",
      amount: 0,
      category: "Staff Invoice",
      department: asset.department || "",
      image_url: asset.url,
      confidence: "-",
      date: asset.created_at || "",
      source_type: "asset_invoice",
      raw_asset: asset,
    }));

    return dedupeById([...apiItems, ...assetItems]);
  }, [invoiceAssetsPending, pendingApiInvoices]);

  const normalizedSentToAccounting = useMemo(() => {
    const apiItems = apiInvoicesSentToAccounting.map((invoice) => ({
      ...invoice,
      source_type: "invoice_api",
    }));

    const assetItems = invoiceAssetsSentToAccounting.map((asset) => ({
      id: asset.id,
      vendor: asset.note || "Staff Invoice Upload",
      amount: 0,
      category: "Staff Invoice",
      department: asset.department || "",
      image_url: asset.url,
      confidence: "-",
      date: asset.created_at || "",
      source_type: "asset_invoice",
      raw_asset: asset,
    }));

    return dedupeById([...apiItems, ...assetItems]);
  }, [apiInvoicesSentToAccounting, invoiceAssetsSentToAccounting]);

  const normalizedFinalApprovedInvoices = useMemo(() => {
    const apiItems = finalApprovedApiInvoices.map((invoice) => ({
      ...invoice,
      source_type: "invoice_api",
    }));

    const assetItems = invoiceAssetsApproved.map((asset) => ({
      id: asset.id,
      vendor: asset.note || "Staff Invoice Upload",
      amount: 0,
      category: "Staff Invoice",
      department: asset.department || "",
      image_url: asset.url,
      confidence: "-",
      date: asset.created_at || "",
      source_type: "asset_invoice",
      raw_asset: asset,
    }));

    return dedupeById([...apiItems, ...assetItems]);
  }, [finalApprovedApiInvoices, invoiceAssetsApproved]);

  const normalizedRejectedInvoices = useMemo(() => {
    const apiItems = rejectedApiInvoices.map((invoice) => ({
      ...invoice,
      source_type: "invoice_api",
    }));

    const assetItems = invoiceAssetsRejected.map((asset) => ({
      id: asset.id,
      vendor: asset.note || "Staff Invoice Upload",
      amount: 0,
      category: "Staff Invoice",
      department: asset.department || "",
      image_url: asset.url,
      confidence: "-",
      date: asset.created_at || "",
      source_type: "asset_invoice",
      raw_asset: asset,
    }));

    return dedupeById([...apiItems, ...assetItems]);
  }, [invoiceAssetsRejected, rejectedApiInvoices]);

  const totalPendingCount =
    normalizedPendingInvoices.length +
    routineAssetsPending.length +
    foodAssetsPending.length +
    marketingAssetsPending.length +
    pendingPenalties.length +
    pendingSalary.length;

  const pendingFinanceCount =
    normalizedPendingInvoices.length + pendingSalary.length + pendingPenalties.length;

  const pendingOperationsCount = routineAssetsPending.length + foodAssetsPending.length;
  const pendingMarketingCount = marketingAssetsPending.length;

  const openInvoicePreview = useCallback((invoice) => {
    const url = getInvoicePreviewUrl(invoice);
    const type = getInvoicePreviewType(invoice);

    if (!url) return;

    setPreviewItem({
      type,
      title: invoice?.vendor || "Invoice Preview",
      subtitle: invoice?.amount ? `${invoice.amount} THB` : "Invoice",
      url,
    });
  }, []);

  const openAssetPreview = useCallback((asset, fallbackTitle = "Asset Preview") => {
    if (!asset?.url) return;

    setPreviewItem({
      type: "image",
      title: fallbackTitle,
      subtitle: asset?.note || asset?.uploaded_by || "",
      url: asset.url,
    });
  }, []);

  const approvePenalty = useCallback(
    (id) => {
      const updated = attendance.map((item) =>
        item.id === id ? { ...item, status: "approved" } : item
      );

      localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(updated));
      setAttendance(updated);
    },
    [attendance]
  );

  const rejectPenalty = useCallback(
    (id) => {
      const updated = attendance.map((item) =>
        item.id === id ? { ...item, status: "rejected", penalty: 0 } : item
      );

      localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(updated));
      setAttendance(updated);
    },
    [attendance]
  );

  const approveSalary = useCallback(
    (staffName) => {
      const updatedHistory = history.map((day) => {
        if (!latestDay || day.date !== latestDay.date) return day;

        return {
          ...day,
          staff: day.staff.map((member) =>
            member.name === staffName ? { ...member, approved: true } : member
          ),
        };
      });

      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(updatedHistory));
      setHistory(updatedHistory);
    },
    [history, latestDay]
  );

  const updateInvoiceStatus = useCallback(
  async (id, status) => {
    try {
      console.log("SENDING STATUS TO API:", status); // 👈 ADD THIS

      setActionLoading(`invoice-${id}-${status}`);
      setErrorMessage("");

      const res = await fetch("/api/invoices/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
        });

        if (!res.ok) {
          throw new Error(`Invoice update failed with ${res.status}`);
        }

        await fetchInvoices();
      } catch (error) {
        console.error("INVOICE UPDATE ERROR:", error);
        setErrorMessage("Could not update invoice status.");
      } finally {
        setActionLoading("");
      }
    },
    [fetchInvoices]
  );

  const updateAssetStatus = useCallback(
  async (asset, status) => {
    if (!asset?.id) return;

    const category = normalizeCategory(asset?.category);
    const impact = getCategoryImpact(category, status);

    try {
      setActionLoading(`asset-${asset.id}-${status}`);
      setErrorMessage("");

      // ✅ INSTANT UI UPDATE (fixes double click)
   setAssets((prev) =>
  (prev || []).map((a) =>
    a.id === asset.id
      ? { ...a, status }
      : a
  )
);

      // ✅ API CALL
      const res = await fetch("/api/assets/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: asset.id,
          status,
          impact,
        }),
      });

      if (!res.ok) {
        throw new Error("Asset update failed");
      }

      // ✅ rejection tracking
      if (status === "rejected") {
        saveRejectionEntry(asset);
      } else {
        removeRejectionEntry(asset.id);
      }

      setRejections(
        safeJsonParse(localStorage.getItem(STORAGE_KEYS.rejections), [])
      );

      // ✅ background refresh (no UI delay)
      fetchAssets();

    } catch (error) {
      console.error("ASSET UPDATE ERROR:", error);
      setErrorMessage("Could not update asset status.");
    } finally {
      setActionLoading("");
    }
  },
  [fetchAssets]
);

  const approveInvoiceItem = useCallback(
    async (item) => {
      if (item.source_type === "asset_invoice") {
        await updateAssetStatus(item.raw_asset, STATUS.APPROVED_MANAGER);
        return;
      }

      await updateInvoiceStatus(item.id, STATUS.APPROVED_MANAGER);
    },
    [updateAssetStatus, updateInvoiceStatus]
  );

  const rejectInvoiceItem = useCallback(
    async (item) => {
      if (item.source_type === "asset_invoice") {
        await updateAssetStatus(item.raw_asset, STATUS.REJECTED);
        return;
      }

      await updateInvoiceStatus(item.id, STATUS.REJECTED);
    },
    [updateAssetStatus, updateInvoiceStatus]
  );

  const kitchenRejectionCount = useMemo(() => {
    return rejections.filter((entry) => entry.applies_to === "kitchen_team").length;
  }, [rejections]);

  const routineDepartmentPenaltyCount = useMemo(() => {
    return rejections.filter((entry) => entry.penalty_mode === "team_department_quality").length;
  }, [rejections]);

   return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Approvals</h1>
            <p className="text-white/50 text-sm">
              Unified manager approval center for finance, operations, staff, and marketing
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={fetchInvoices}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
            >
              {refreshingInvoices ? "Refreshing invoices..." : "Refresh invoices"}
            </button>

            <button
              onClick={fetchAssets}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
            >
              {refreshingAssets ? "Refreshing assets..." : "Refresh assets"}
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard
            title="Total Pending"
            value={totalPendingCount}
            tone="orange"
            hint="All pending manager actions"
          />
          <StatCard
            title="Finance Queue"
            value={pendingFinanceCount}
            hint="Invoices, salary, penalties"
          />
          <StatCard
            title="Operations Queue"
            value={pendingOperationsCount}
            hint="Routine and food control"
          />
          <StatCard
            title="Marketing Queue"
            value={pendingMarketingCount}
            hint="Marketing content approvals"
          />
          <StatCard
            title="Sent to Accounting"
            value={normalizedSentToAccounting.length}
            hint="Awaiting final accounting approval"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MiniInfoCard
            title="Kitchen Team Penalties"
            value={kitchenRejectionCount}
            subtitle="Food rejections punish the whole kitchen team"
          />
          <MiniInfoCard
            title="Routine Team Penalties"
            value={routineDepartmentPenaltyCount}
            subtitle="Routine rejections punish the department only"
          />
          <MiniInfoCard
            title="Marketing Missing Uploads"
            value={marketingSubmissionPenalties.length}
            subtitle="Per-person penalty if no marketing picture was uploaded"
          />
        </div>

        <SectionCard
          title="Invoice Approval"
          subtitle="Manager step before invoices move to accounting"
        >
          {loadingInvoices && loadingAssets ? (
            <EmptyState text="Loading invoices..." />
          ) : normalizedPendingInvoices.length === 0 ? (
            <EmptyState text="No invoices awaiting manager approval" />
          ) : (
            <div className="space-y-4">
              {normalizedPendingInvoices.map((invoice) => {
                const previewUrl = getInvoicePreviewUrl(invoice);
                const previewType = getInvoicePreviewType(invoice);

                return (
                  <div
                    key={`${invoice.source_type}-${invoice.id}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-lg font-medium">
                          {invoice.vendor || "Unknown Vendor"}
                        </div>
                        <div className="text-sm text-white/50">
                          {invoice.category || "No category"}{" "}
                          {invoice.department ? `(${invoice.department})` : ""}
                        </div>
                        <div className="text-sm text-white/70 mt-1">
                          {formatCurrency(invoice.amount || 0)}
                        </div>
                        <div className="text-xs text-white/35 mt-1">
                          Confidence: {invoice.confidence || "-"}
                        </div>
                        {invoice.date ? (
                          <div className="text-xs text-white/30 mt-1">
                            Date: {formatDateTime(invoice.date)}
                          </div>
                        ) : null}
                        <div className="text-xs text-white/30 mt-1">
                          Source:{" "}
                          {invoice.source_type === "asset_invoice"
                            ? "Staff Upload"
                            : "Invoice System"}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        {previewUrl ? (
                          <button
                            onClick={() => openInvoicePreview(invoice)}
                            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
                          >
                            {previewType === "pdf" ? "Open PDF" : "Preview"}
                          </button>
                        ) : null}

                        <button
                          onClick={() => approveInvoiceItem(invoice)}
                          disabled={
                            actionLoading === `invoice-${invoice.id}-${STATUS.APPROVED_MANAGER}` ||
                            actionLoading === `asset-${invoice.id}-${STATUS.APPROVED_MANAGER}`
                          }
                          className="px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-sm text-black font-medium disabled:opacity-50"
                        >
                          {actionLoading === `invoice-${invoice.id}-${STATUS.APPROVED_MANAGER}` ||
                          actionLoading === `asset-${invoice.id}-${STATUS.APPROVED_MANAGER}`
                            ? "Approving..."
                            : "Approve"}
                        </button>

                        <button
                          onClick={() => rejectInvoiceItem(invoice)}
                          disabled={
                            actionLoading === `invoice-${invoice.id}-${STATUS.REJECTED}` ||
                            actionLoading === `asset-${invoice.id}-${STATUS.REJECTED}`
                          }
                          className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm text-white font-medium disabled:opacity-50"
                        >
                          {actionLoading === `invoice-${invoice.id}-${STATUS.REJECTED}` ||
                          actionLoading === `asset-${invoice.id}-${STATUS.REJECTED}`
                            ? "Rejecting..."
                            : "Reject"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Sent to Accounting"
          subtitle="Manager-approved invoices waiting for final accounting approval"
        >
          {loadingInvoices && loadingAssets ? (
            <EmptyState text="Loading..." />
          ) : normalizedSentToAccounting.length === 0 ? (
            <EmptyState text="No invoices sent to accounting yet" />
          ) : (
            <div className="space-y-3">
              {normalizedSentToAccounting.map((invoice) => (
                <div
                  key={`${invoice.source_type}-${invoice.id}`}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div>
                    <div className="font-medium">{invoice.vendor || "Unknown Vendor"}</div>
                    <div className="text-sm text-white/50">
                      {invoice.category || "No category"}{" "}
                      {invoice.department ? `(${invoice.department})` : ""}
                    </div>
                    <div className="text-xs text-white/35 mt-1">
                      {formatCurrency(invoice.amount || 0)}
                    </div>
                    <div className="text-xs text-white/30 mt-1">
                      Source:{" "}
                      {invoice.source_type === "asset_invoice"
                        ? "Staff Upload"
                        : "Invoice System"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getInvoicePreviewUrl(invoice) ? (
                      <button
                        onClick={() => openInvoicePreview(invoice)}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
                      >
                        Preview
                      </button>
                    ) : null}
                    <span className="text-green-400 text-sm">Approved by Manager</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Routine Control"
          subtitle="Routine uploads from FOH and Kitchen teams. Rejection punishes the department team, not one person. Missing upload alone does not punish the team."
        >
          {loadingAssets ? (
            <EmptyState text="Loading routine uploads..." />
          ) : routineAssetsPending.length === 0 ? (
            <EmptyState text="No routine uploads awaiting approval" />
          ) : (
            <div className="space-y-4">
              {routineAssetsPending.map((asset) => (
                <AssetApprovalRow
                  key={asset.id}
                  asset={asset}
                  titleFallback="Routine photo"
                  previewLabel="Routine Preview"
                  actionLoading={actionLoading}
                  requireRejectNote={true}
                  onPreview={openAssetPreview}
                  onApprove={() => updateAssetStatus(asset, STATUS.APPROVED)}
                  onReject={(note) => updateAssetStatus(asset, STATUS.REJECTED, note)}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Food Quality Control"
          subtitle="Food uploads belong to the kitchen team. Rejection punishes the whole kitchen team."
        >
          {loadingAssets ? (
            <EmptyState text="Loading food uploads..." />
          ) : foodAssetsPending.length === 0 ? (
            <EmptyState text="No food uploads awaiting approval" />
          ) : (
            <div className="space-y-4">
              {foodAssetsPending.map((asset) => (
                <AssetApprovalRow
                  key={asset.id}
                  asset={asset}
                  titleFallback="Food upload"
                  previewLabel="Food Quality Preview"
                  actionLoading={actionLoading}
                  requireRejectNote={true}
                  onPreview={openAssetPreview}
                  onApprove={() => updateAssetStatus(asset, STATUS.APPROVED)}
                  onReject={(note) => updateAssetStatus(asset, STATUS.REJECTED, note)}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Marketing Asset Approval"
          subtitle="Marketing rejection does not punish staff. Missing daily marketing upload is a per-person performance issue."
        >
          {loadingAssets ? (
            <EmptyState text="Loading marketing assets..." />
          ) : marketingAssetsPending.length === 0 ? (
            <EmptyState text="No marketing assets awaiting approval" />
          ) : (
            <div className="space-y-4">
              {marketingAssetsPending.map((asset) => (
                <AssetApprovalRow
                  key={asset.id}
                  asset={asset}
                  titleFallback="Marketing asset"
                  previewLabel="Marketing Preview"
                  actionLoading={actionLoading}
                  requireRejectNote={false}
                  onPreview={openAssetPreview}
                  onApprove={() => updateAssetStatus(asset, STATUS.APPROVED)}
                  onReject={() => updateAssetStatus(asset, STATUS.REJECTED)}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SectionCard
            title="Approved Marketing Assets"
            subtitle="Ready for AI marketing, campaigns, and daily posting"
          >
            {loadingAssets ? (
              <EmptyState text="Loading..." />
            ) : marketingAssetsApproved.length === 0 ? (
              <EmptyState text="No approved marketing assets yet" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {marketingAssetsApproved.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => openAssetPreview(asset, "Approved Marketing Asset")}
                    className="rounded-2xl overflow-hidden bg-white/5 border border-white/10"
                  >
                    <div className="aspect-square bg-white/10">
                      {asset.url ? (
                        <img
                          src={asset.url}
                          alt="Approved marketing asset"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="p-2 text-left">
                      <div className="text-xs text-white/70 truncate">
                        {asset.note || "Approved asset"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Approved Operations Assets"
            subtitle="Routine and food photos already approved"
          >
            {routineAssetsApproved.length + foodAssetsApproved.length === 0 ? (
              <EmptyState text="No approved routine or food assets yet" />
            ) : (
              <div className="space-y-3">
                {[...routineAssetsApproved, ...foodAssetsApproved].slice(0, 8).map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openAssetPreview(asset, "Approved Operations Asset")}
                        className="w-14 h-14 rounded-xl overflow-hidden bg-white/10"
                      >
                        {asset.url ? (
                          <img
                            src={asset.url}
                            alt="Approved operations asset"
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </button>
                      <div>
                        <div className="text-sm font-medium">
                          {asset.note || asset.category || "Approved item"}
                        </div>
                        <div className="text-xs text-white/40">
                          {asset.category} {asset.department ? `• ${asset.department}` : ""}
                        </div>
                      </div>
                    </div>

                    <span className="text-green-400 text-xs">Approved</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Marketing Missing Upload Penalties"
          subtitle="This is per person. If a marketing team member does not upload a picture, that person gets the penalty. Rejection itself does not punish marketing."
        >
          {marketingSubmissionPenalties.length === 0 ? (
            <EmptyState text="No missing marketing uploads detected today" />
          ) : (
            <div className="space-y-3">
              {marketingSubmissionPenalties.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4"
                >
                  <div>
                    <div className="font-medium">{entry.name}</div>
                    <div className="text-sm text-white/60">{entry.reason}</div>
                    <div className="text-xs text-white/40 mt-1">
                      Department: {entry.department || "marketing"}
                    </div>
                  </div>
                  <span className="text-orange-300 text-sm">Performance penalty</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Late Penalties"
          subtitle="Operational discipline and manager review"
        >
          {pendingPenalties.length === 0 ? (
            <EmptyState text="No late penalties pending" />
          ) : (
            <div className="space-y-3">
              {pendingPenalties.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-white/50">
                      Late penalty: {formatCurrency(item.penalty || 0)}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => approvePenalty(item.id)}
                      className="px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-sm text-black font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectPenalty(item.id)}
                      className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm text-white font-medium"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Salary Approval"
          subtitle="Manager review before final payroll flow continues"
        >
          {!latestDay?.staff?.length ? (
            <EmptyState text="No salary data found" />
          ) : pendingSalary.length === 0 ? (
            <EmptyState text="All salary items approved" />
          ) : (
            <div className="space-y-3">
              {pendingSalary.map((member, index) => (
                <div
                  key={`${member.name}-${index}`}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-sm text-white/50">
                      Payout: {formatCurrency(member.payout || 0)}
                    </div>
                  </div>

                  <button
                    onClick={() => approveSalary(member.name)}
                    className="px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-sm text-black font-medium"
                  >
                    Approve
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MiniInfoCard
            title="Approved Salary"
            value={approvedSalary.length}
            subtitle="Current day approved payouts"
          />
          <MiniInfoCard
            title="Approved Penalties"
            value={approvedPenalties.length}
            subtitle="Late penalties approved"
          />
          <MiniInfoCard
            title="Final Approved Invoices"
            value={normalizedFinalApprovedInvoices.length}
            subtitle="Fully approved finance items"
          />
          <MiniInfoCard
            title="Rejected Items"
            value={
              normalizedRejectedInvoices.length +
              routineAssetsRejected.length +
              foodAssetsRejected.length +
              marketingAssetsRejected.length +
              rejectedPenalties.length
            }
            subtitle="Rejected snapshot"
          />
        </div>

        {previewItem ? (
          <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPreviewItem(null)}
          >
            <div
              className="w-full max-w-6xl max-h-[95vh] rounded-3xl overflow-hidden border border-white/10 bg-black/80 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div>
                  <div className="font-medium">{previewItem.title}</div>
                  {previewItem.subtitle ? (
                    <div className="text-sm text-white/50">{previewItem.subtitle}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={previewItem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
                  >
                    Open Original
                  </a>
                  <button
                    onClick={() => setPreviewItem(null)}
                    className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="p-4 flex items-center justify-center bg-black min-h-[60vh] max-h-[85vh] overflow-auto">
                {previewItem.type === "pdf" ? (
                  <iframe
                    src={previewItem.url}
                    title="PDF Preview"
                    className="w-full h-[80vh] rounded-2xl bg-white"
                  />
                ) : (
                  <img
                    src={previewItem.url}
                    alt="Preview"
                    className="max-w-full max-h-[80vh] rounded-2xl object-contain"
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function AssetApprovalRow({
  asset,
  titleFallback,
  previewLabel,
  actionLoading,
  onPreview,
  onApprove,
  onReject,
  requireRejectNote = false,
}) {
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const handleReject = () => {
    if (requireRejectNote && !showRejectNote) {
      setShowRejectNote(true);
      return;
    }

    if (requireRejectNote && !rejectNote.trim()) {
      alert("Rejection comment is required for routine and food uploads.");
      return;
    }

    onReject(rejectNote.trim());
    setRejectNote("");
    setShowRejectNote(false);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => onPreview(asset, previewLabel)}
            className="w-24 h-24 rounded-2xl overflow-hidden bg-white/10 shrink-0"
          >
            {asset.url ? (
              <img
                src={asset.url}
                alt={previewLabel}
                className="w-full h-full object-cover"
              />
            ) : null}
          </button>

          <div className="space-y-1">
            <div className="font-medium">{asset.note || titleFallback}</div>
            <div className="text-sm text-white/50">
              Department: {asset.department || "Unknown"}
            </div>
            <div className="text-xs text-white/35">
              Uploaded by: {asset.uploaded_by || "Unknown"}
            </div>
            <div className="text-xs text-white/35">Status: {asset.status || "-"}</div>
            <div className="text-xs text-white/30">
              Created: {formatDateTime(asset.created_at)}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => onPreview(asset, previewLabel)}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
          >
            Preview
          </button>

          <button
            onClick={onApprove}
            disabled={actionLoading === `asset-${asset.id}-${STATUS.APPROVED}`}
            className="px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-sm text-black font-medium disabled:opacity-50"
          >
            {actionLoading === `asset-${asset.id}-${STATUS.APPROVED}` ? "Approving..." : "Approve"}
          </button>

          <button
            onClick={handleReject}
            disabled={actionLoading === `asset-${asset.id}-${STATUS.REJECTED}`}
            className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm text-white font-medium disabled:opacity-50"
          >
            {actionLoading === `asset-${asset.id}-${STATUS.REJECTED}`
              ? "Rejecting..."
              : showRejectNote
              ? "Confirm Reject"
              : "Reject"}
          </button>
        </div>
      </div>

      {showRejectNote ? (
        <div className="mt-4">
          <textarea
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            placeholder="Write rejection comment..."
            className="w-full min-h-[90px] rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-red-400/50"
          />
          <div className="mt-2 text-xs text-white/40">
            Required for routine and food rejections.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-5">
        <h2 className="text-xl font-medium">{title}</h2>
        {subtitle ? <p className="text-sm text-white/45 mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StatCard({ title, value, hint, tone = "default" }) {
  const toneClass = tone === "orange" ? "text-[#ff7a00]" : "text-white";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="text-sm text-white/45">{title}</div>
      <div className={`text-3xl font-semibold mt-2 ${toneClass}`}>{value}</div>
      {hint ? <div className="text-xs text-white/30 mt-2">{hint}</div> : null}
    </div>
  );
}

function MiniInfoCard({ title, value, subtitle }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="text-sm text-white/45">{title}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {subtitle ? <div className="text-xs text-white/30 mt-2">{subtitle}</div> : null}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-white/40">
      {text}
    </div>
  );
}

function MarketingPenaltyRow({ entry }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">{entry.name}</div>
      <div className="text-sm text-white/60">{entry.reason}</div>
      <div className="text-xs text-white/40 mt-1">
        Department: {entry.department || "marketing"}
      </div>
    </div>
  );
}