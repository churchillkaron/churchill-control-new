"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import SearchableSelect from "@/components/SearchableSelect";

const ACCOUNT_TYPES = [
  "Revenue",
  "COGS",
  "Operating Expense",
  "Owner / Non-Operating",
];

const DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "Breakfast",
  "Entertainment",
  "Operations",
  "Admin",
  "Utilities",
  "Staff Welfare",
  "Marketing",
  "Owner",
];

const NATURAL_ACCOUNTS = {
  "Food Main Kitchen": { type: "COGS", department: "Kitchen" },
  "Food Thai Kitchen": { type: "COGS", department: "Kitchen" },
  "Pizza Kitchen": { type: "COGS", department: "Kitchen" },
  Alcohol: { type: "COGS", department: "Bar" },
  "Soft Drinks": { type: "COGS", department: "Bar" },
  "Breakfast Food": { type: "COGS", department: "Breakfast" },
  DJ: { type: "Operating Expense", department: "Entertainment" },
  Band: { type: "Operating Expense", department: "Entertainment" },
  Acoustic: { type: "Operating Expense", department: "Entertainment" },
  Events: { type: "Operating Expense", department: "Entertainment" },
  "Staff Food": { type: "Operating Expense", department: "Staff Welfare" },
  "Staff Drinks": { type: "Operating Expense", department: "Staff Welfare" },
  "Staff Rewards": { type: "Operating Expense", department: "Staff Welfare" },
  "Staff Tax": { type: "Operating Expense", department: "Staff Welfare" },
  SSO: { type: "Operating Expense", department: "Staff Welfare" },
  Cleaning: { type: "Operating Expense", department: "Operations" },
  "Cleaning Supplies": { type: "Operating Expense", department: "Operations" },
  Decoration: { type: "Operating Expense", department: "Operations" },
  Maintenance: { type: "Operating Expense", department: "Operations" },
  "Restaurant Supplies": { type: "Operating Expense", department: "Operations" },
  Transportation: { type: "Operating Expense", department: "Operations" },
  "Kitchen Supplies": { type: "Operating Expense", department: "Operations" },
  "Bar Supplies": { type: "Operating Expense", department: "Operations" },
  "Bar Equipment": { type: "Operating Expense", department: "Operations" },
  Rent: { type: "Operating Expense", department: "Admin" },
  "Accounting Fees": { type: "Operating Expense", department: "Admin" },
  Software: { type: "Operating Expense", department: "Admin" },
  Depreciation: { type: "Operating Expense", department: "Admin" },
  Salaries: { type: "Operating Expense", department: "Admin" },
  Overtime: { type: "Operating Expense", department: "Admin" },
  "Service Charge": { type: "Operating Expense", department: "Admin" },
  Postage: { type: "Operating Expense", department: "Admin" },
  Electricity: { type: "Operating Expense", department: "Utilities" },
  Gas: { type: "Operating Expense", department: "Utilities" },
  Ads: { type: "Operating Expense", department: "Marketing" },
  "Social Media": { type: "Operating Expense", department: "Marketing" },
  Promotions: { type: "Operating Expense", department: "Marketing" },
  "Content Creation": { type: "Operating Expense", department: "Marketing" },
  Miscellaneous: { type: "Operating Expense", department: "Operations" },
  "Police / Irregular": { type: "Operating Expense", department: "Operations" },
  "Owner Funding": { type: "Owner / Non-Operating", department: "Owner" },
  "Owner Withdrawal": { type: "Owner / Non-Operating", department: "Owner" },
};

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toInputDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    name_thai: item.name_thai || "",
    name_english: item.name_english || item.name || "",
    qty: Number(item.qty || 1),
    unit_price: Number(item.unit_price || 0),
    total_price: Number(item.total_price || 0),
    account_type: item.account_type || "Operating Expense",
    department: item.department || "Operations",
    natural_account: item.natural_account || "Miscellaneous",
  }));
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

async function loadLearningFromDB() {
  const { data, error } = await supabase.from("item_learning").select("*");

  if (error) {
    console.error("Learning load error:", error);
    return {};
  }

  const map = {};

  (data || []).forEach((row) => {
    map[row.name] = {
      department: row.department,
      account_type: row.account_type,
      natural_account: row.natural_account,
    };
  });

  return map;
}

function ruleBasedSuggestion(name = "") {
  const text = normalizeKey(name);

  if (
    text.includes("flour") ||
    text.includes("sugar") ||
    text.includes("oil") ||
    text.includes("rice") ||
    text.includes("starch") ||
    text.includes("pork") ||
    text.includes("chicken") ||
    text.includes("beef") ||
    text.includes("fish") ||
    text.includes("shrimp") ||
    text.includes("egg") ||
    text.includes("milk") ||
    text.includes("cheese") ||
    text.includes("bread") ||
    text.includes("vegetable")
  ) {
    return {
      department: "Kitchen",
      account_type: "COGS",
      natural_account: "Food Main Kitchen",
    };
  }

  if (
    text.includes("beer") ||
    text.includes("wine") ||
    text.includes("vodka") ||
    text.includes("whisky") ||
    text.includes("rum") ||
    text.includes("gin") ||
    text.includes("tequila")
  ) {
    return {
      department: "Bar",
      account_type: "COGS",
      natural_account: "Alcohol",
    };
  }

  if (
    text.includes("coke") ||
    text.includes("water") ||
    text.includes("soda") ||
    text.includes("juice") ||
    text.includes("sprite") ||
    text.includes("fanta")
  ) {
    return {
      department: "Bar",
      account_type: "COGS",
      natural_account: "Soft Drinks",
    };
  }

  if (
    text.includes("clean") ||
    text.includes("soap") ||
    text.includes("tissue") ||
    text.includes("trash") ||
    text.includes("garbage")
  ) {
    return {
      department: "Operations",
      account_type: "Operating Expense",
      natural_account: "Cleaning Supplies",
    };
  }

  return null;
}

function getSmartSuggestion(name, memory) {
  const key = normalizeKey(name);
  if (!key) return null;
  return memory[key] || ruleBasedSuggestion(key);
}

export default function InvoiceManagement() {
  const [invoices, setInvoices] = useState([]);
  const [editedInvoices, setEditedInvoices] = useState({});
  const [learningMemory, setLearningMemory] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  async function loadInvoices() {
    setLoading(true);
    setErrorText("");

    try {
      const memory = await loadLearningFromDB();
      setLearningMemory(memory);

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .in("status", ["submitted", "pending_manager", "pending"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD ERROR:", error);
        setErrorText(error.message);
        setInvoices([]);
        return;
      }

      const rows = data || [];
      setInvoices(rows);

      const editable = {};

      rows.forEach((inv) => {
        editable[inv.id] = {
          vendor: inv.vendor || "",
          date: toInputDate(inv.date),
          total_amount: Number(inv.total_amount || inv.amount || 0),
          items: normalizeItems(inv.items),
        };
      });

      setEditedInvoices(editable);
    } catch (err) {
      console.error("LOAD CATCH:", err);
      setErrorText(err.message || "Load failed");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, []);

  function updateInvoiceField(invoiceId, field, value) {
    setEditedInvoices((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        [field]: field === "total_amount" ? Number(value || 0) : value,
      },
    }));
  }

  function updateItemField(invoiceId, index, field, value) {
    setEditedInvoices((prev) => {
      const current = prev[invoiceId] || {};
      const items = [...(current.items || [])];

      const updatedValue =
        field === "qty" || field === "unit_price" || field === "total_price"
          ? Number(value || 0)
          : value;

      items[index] = {
        ...items[index],
        [field]: updatedValue,
      };

      if (field === "name_english") {
        const suggestion = getSmartSuggestion(value, learningMemory);

        if (suggestion) {
          items[index] = {
            ...items[index],
            department: suggestion.department || items[index].department,
            account_type: suggestion.account_type || items[index].account_type,
            natural_account:
              suggestion.natural_account || items[index].natural_account,
          };
        }
      }

      return {
        ...prev,
        [invoiceId]: {
          ...current,
          items,
        },
      };
    });
  }

  function applySuggestion(invoiceId, index) {
    const currentItem = editedInvoices[invoiceId]?.items?.[index];
    const suggestion = getSmartSuggestion(
      currentItem?.name_english,
      learningMemory
    );

    if (!suggestion) return;

    setEditedInvoices((prev) => {
      const current = prev[invoiceId] || {};
      const items = [...(current.items || [])];

      items[index] = {
        ...items[index],
        department: suggestion.department || items[index].department,
        account_type: suggestion.account_type || items[index].account_type,
        natural_account: suggestion.natural_account || items[index].natural_account,
      };

      return {
        ...prev,
        [invoiceId]: {
          ...current,
          items,
        },
      };
    });
  }

  function addItem(invoiceId) {
    setEditedInvoices((prev) => {
      const current = prev[invoiceId] || {};
      const items = [...(current.items || [])];

      items.push({
        name_thai: "",
        name_english: "",
        qty: 1,
        unit_price: 0,
        total_price: 0,
        account_type: "Operating Expense",
        department: "Operations",
        natural_account: "Miscellaneous",
      });

      return {
        ...prev,
        [invoiceId]: {
          ...current,
          items,
        },
      };
    });
  }

  function removeItem(invoiceId, index) {
    setEditedInvoices((prev) => {
      const current = prev[invoiceId] || {};
      const items = [...(current.items || [])];

      items.splice(index, 1);

      return {
        ...prev,
        [invoiceId]: {
          ...current,
          items,
        },
      };
    });
  }

  function learnFromInvoice(id) {
    const edited = editedInvoices[id];
    if (!edited) return learningMemory;

    const nextMemory = { ...learningMemory };

    (edited.items || []).forEach((item) => {
      const key = normalizeKey(item.name_english || item.name_thai);
      if (!key) return;

      nextMemory[key] = {
        department: item.department || "Operations",
        account_type: item.account_type || "Operating Expense",
        natural_account: item.natural_account || "Miscellaneous",
      };
    });

    setLearningMemory(nextMemory);
    return nextMemory;
  }

  async function saveInvoice(id) {
    const edited = editedInvoices[id];

    if (!edited) {
      alert("No invoice data found");
      return false;
    }

    learnFromInvoice(id);

    const { error } = await supabase
      .from("invoices")
      .update({
        vendor: edited.vendor || "Unknown Vendor",
        date: edited.date || null,
        total_amount: Number(edited.total_amount || 0),
        amount: Number(edited.total_amount || 0),
        items: edited.items || [],
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return false;
    }

    await loadInvoices();
    return true;
  }

  async function approveInvoice(inv) {
    const saved = await saveInvoice(inv.id);
    if (!saved) return;

    const response = await fetch("/api/approvals/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entityType: "invoice",
        entityId: inv.id,
        currentStatus: inv.status,
        role: "manager",
        actedBy: null,
        notes: "Manager approval",
      }),
    });

    const result = await response.json();

    if (!result.success) {
      alert(result.error);
      return;
    }

    await loadInvoices();
  }

  async function rejectInvoice(inv) {
    const response = await fetch("/api/approvals/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entityType: "invoice",
        entityId: inv.id,
        currentStatus: inv.status,
        role: "manager",
        actedBy: null,
        reason: "Rejected by manager",
      }),
    });

    const result = await response.json();

    if (!result.success) {
      alert(result.error);
      return;
    }

    await loadInvoices();
  }

  if (loading) {
    return (
      <div style={{ padding: 30, color: "white", background: "black" }}>
        Loading invoices...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 30,
        background: "black",
        color: "white",
      }}
    >
      <h1 style={{ marginBottom: 20 }}>Invoice Approval</h1>

      {errorText && (
        <p style={{ color: "red", marginBottom: 20 }}>
          Load error: {errorText}
        </p>
      )}

      {invoices.length === 0 && <p>No pending invoices</p>}

      {invoices.map((inv) => {
        const edited = editedInvoices[inv.id] || {
          vendor: "",
          date: "",
          total_amount: 0,
          items: [],
        };

        return (
          <div
            key={inv.id}
            style={{
              border: "1px solid #333",
              borderRadius: 14,
              padding: 20,
              marginBottom: 20,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr",
                gap: 20,
                alignItems: "start",
              }}
            >
              <div>
                {inv.image_url ? (
                  <a href={inv.image_url} target="_blank" rel="noreferrer">
                    <img
                      src={inv.image_url}
                      alt="Invoice preview"
                      style={{
                        width: 140,
                        height: 140,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "1px solid #333",
                        background: "#111",
                      }}
                    />
                  </a>
                ) : (
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: 10,
                      border: "1px solid #333",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#777",
                    }}
                  >
                    No image
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label>
                  Vendor
                  <input
                    value={edited.vendor}
                    onChange={(e) =>
                      updateInvoiceField(inv.id, "vendor", e.target.value)
                    }
                    style={inputStyle}
                  />
                </label>

                <label>
                  Purchase Date
                  <input
                    type="date"
                    value={edited.date}
                    onChange={(e) =>
                      updateInvoiceField(inv.id, "date", e.target.value)
                    }
                    style={inputStyle}
                  />
                </label>

                <label>
                  Total Amount
                  <input
                    type="number"
                    value={edited.total_amount}
                    onChange={(e) =>
                      updateInvoiceField(
                        inv.id,
                        "total_amount",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </label>

                <p>Status: {inv.status}</p>
                <p>Uploaded: {formatDateTime(inv.created_at)}</p>

                {inv.image_url && (
                  <a
                    href={inv.image_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#ff7a00" }}
                  >
                    Open full invoice image
                  </a>
                )}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 120px",
                  gap: 10,
                  paddingBottom: 8,
                  borderBottom: "1px solid #333",
                  fontWeight: "bold",
                  color: "#aaa",
                }}
              >
                <span>Item</span>
                <span>Qty</span>
                <span>Unit</span>
                <span>Total</span>
                <span>Department</span>
                <span>Account</span>
                <span>Action</span>
              </div>

              {(edited.items || []).map((item, i) => {
                const suggestion = getSmartSuggestion(
                  item.name_english,
                  learningMemory
                );

                return (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 120px",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <input
                      value={item.name_english || ""}
                      onChange={(e) =>
                        updateItemField(
                          inv.id,
                          i,
                          "name_english",
                          e.target.value
                        )
                      }
                      style={inputStyle}
                    />

                    <input
                      type="number"
                      value={item.qty || 0}
                      onChange={(e) =>
                        updateItemField(inv.id, i, "qty", e.target.value)
                      }
                      style={inputStyle}
                    />

                    <input
                      type="number"
                      value={item.unit_price || 0}
                      onChange={(e) =>
                        updateItemField(
                          inv.id,
                          i,
                          "unit_price",
                          e.target.value
                        )
                      }
                      style={inputStyle}
                    />

                    <input
                      type="number"
                      value={item.total_price || 0}
                      onChange={(e) =>
                        updateItemField(
                          inv.id,
                          i,
                          "total_price",
                          e.target.value
                        )
                      }
                      style={inputStyle}
                    />

                    <SearchableSelect
                      options={DEPARTMENTS}
                      value={item.department}
                      onChange={(val) =>
                        updateItemField(inv.id, i, "department", val)
                      }
                    />

                    <SearchableSelect
                      options={ACCOUNT_TYPES}
                      value={item.account_type}
                      onChange={(val) =>
                        updateItemField(inv.id, i, "account_type", val)
                      }
                    />

                    <button
                      onClick={() => removeItem(inv.id, i)}
                      style={darkButtonStyle}
                    >
                      Remove
                    </button>

                    <SearchableSelect
                      options={Object.keys(NATURAL_ACCOUNTS)}
                      value={item.natural_account}
                      onChange={(val) =>
                        updateItemField(inv.id, i, "natural_account", val)
                      }
                      placeholder="Select natural account"
                      style={{ gridColumn: "1 / span 6" }}
                    />

                    {suggestion && (
                      <button
                        onClick={() => applySuggestion(inv.id, i)}
                        style={{
                          ...darkButtonStyle,
                          color: "#ff7a00",
                        }}
                      >
                        Smart
                      </button>
                    )}
                  </div>
                );
              })}

              <button
                onClick={() => addItem(inv.id)}
                style={{
                  ...darkButtonStyle,
                  marginTop: 12,
                }}
              >
                Add Item
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={() => approveInvoice(inv)}
                style={{
                  marginRight: 10,
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "#ff7a00",
                  color: "black",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Approve
              </button>

              <button
                type="button"
                onClick={() => rejectInvoice(inv)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid #444",
                  background: "#111",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  outline: "none",
};

const darkButtonStyle = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #444",
  background: "#111",
  color: "white",
  cursor: "pointer",
};