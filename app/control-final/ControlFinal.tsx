"use client";

import { useMemo, useState } from "react";

type MenuDish = {
  name: string;
  price: number;
  cost: number;
  category: string;
};

type ReportDish = {
  name: string;
  price: number;
  cost: number;
  quantity: number;
};

const MENU_DISHES: MenuDish[] = [
  { name: "Beef Carpaccio", category: "Starter", price: 320, cost: 110.72 },
  { name: "Chili & Garlic Prawns", category: "Starter", price: 320, cost: 74.32 },
  { name: "Signature Bruschetta", category: "Starter", price: 280, cost: 62.38 },
  { name: "Seared Scallops", category: "Starter", price: 520, cost: 175.72 },
  { name: "Mango & Tomato Salad", category: "Light", price: 220, cost: 16.97 },

  { name: "Churchill Beef Short Ribs", category: "Main", price: 890, cost: 518.36 },
  { name: "Ribeye Steak", category: "Main", price: 890, cost: 206.36 },
  { name: "Beef Tenderloin", category: "Main", price: 920, cost: 265.69 },
  { name: "Pork Tenderloin", category: "Main", price: 460, cost: 76.54 },
  { name: "Salmon", category: "Main", price: 690, cost: 172.6 },
  { name: "Churchill Sambal Half Chicken", category: "Main", price: 590, cost: 133.87 },
  { name: "Veal Stew", category: "Main", price: 850, cost: 254.74 },
  { name: "Pad Thai", category: "Main", price: 160, cost: 56.55 },
  { name: "Pad Ka Prow", category: "Main", price: 150, cost: 36.905 },
  { name: "Stir-Fried Chicken with Cashew Nuts", category: "Main", price: 180, cost: 68.04 },
  { name: "Beef with Oyster Sauce", category: "Main", price: 220, cost: 160.525 },
  { name: "Massaman Curry", category: "Main", price: 180, cost: 90.96 },
  { name: "Green Curry", category: "Main", price: 170, cost: 63.1 },
  { name: "Panang Curry", category: "Main", price: 175, cost: 62.65 },
  { name: "Pineapple Fried Rice", category: "Main", price: 160, cost: 53.45 },

  { name: "Tom Yum Goong", category: "Soup", price: 180, cost: 94.4 },
  { name: "Tom Kha Gai", category: "Soup", price: 170, cost: 70.1 },

  { name: "Potato Gratin", category: "Side", price: 120, cost: 30.34 },
  { name: "Crispy Potato Wedges", category: "Side", price: 100, cost: 18.34 },
  { name: "Cauliflower Puree", category: "Side", price: 120, cost: 27.44 },
];

const EMPTY_ROW: ReportDish = {
  name: "",
  price: 0,
  cost: 0,
  quantity: 1,
};

export default function ControlFinal() {
  const [reportDate, setReportDate] = useState(getTodayDate());
  const [rows, setRows] = useState<ReportDish[]>([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    const revenue = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
    const cost = rows.reduce((sum, row) => sum + row.cost * row.quantity, 0);
    const profit = revenue - cost;

    return { revenue, cost, profit };
  }, [rows]);

  const groupedOptions = useMemo(() => {
    const map = new Map<string, MenuDish[]>();

    for (const dish of MENU_DISHES) {
      if (!map.has(dish.category)) {
        map.set(dish.category, []);
      }
      map.get(dish.category)!.push(dish);
    }

    return Array.from(map.entries());
  }, []);

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      if (prev.length === 1) {
        return [{ ...EMPTY_ROW }];
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateRow(index: number, patch: Partial<ReportDish>) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return { ...row, ...patch };
      })
    );
  }

  function handleDishSelect(index: number, selectedName: string) {
    const selectedDish = MENU_DISHES.find((dish) => dish.name === selectedName);

    if (!selectedDish) {
      updateRow(index, {
        name: "",
        price: 0,
        cost: 0,
        quantity: 1,
      });
      return;
    }

    updateRow(index, {
      name: selectedDish.name,
      price: selectedDish.price,
      cost: selectedDish.cost,
      quantity: Math.max(1, rows[index]?.quantity || 1),
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");
      setError("");

      const cleanDishes = rows
        .filter((row) => row.name.trim() !== "")
        .map((row) => ({
          name: row.name,
          price: Number(row.price) || 0,
          cost: Number(row.cost) || 0,
          quantity: Math.max(1, Number(row.quantity) || 1),
        }));

      if (cleanDishes.length === 0) {
        setError("Please add at least one dish before saving.");
        return;
      }

      const payload = {
        date: reportDate,
        dishes: cleanDishes,
        totals: {
          revenue: totals.revenue,
          cost: totals.cost,
          profit: totals.profit,
        },
      };

      const res = await fetch("/api/save-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save day report.");
      }

      setMessage("Day report saved successfully.");
    } catch (err: any) {
      setError(err?.message || "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Churchill Control System</p>
            <h1 style={styles.title}>Daily Control</h1>
            <p style={styles.subtitle}>
              Add sold dishes, review totals, and save the day report.
            </p>
          </div>
        </div>

        <div style={styles.topBar}>
          <div style={styles.dateCard}>
            <label style={styles.label}>Report Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              style={styles.dateInput}
            />
          </div>

          <div style={styles.actionWrap}>
            <button type="button" onClick={addRow} style={styles.secondaryButton}>
              + Add Dish
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                ...styles.primaryButton,
                ...(saving ? styles.disabledButton : {}),
              }}
            >
              {saving ? "Saving..." : "Save Day"}
            </button>
          </div>
        </div>

        <div style={styles.mainGrid}>
          <div style={styles.leftPanel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Dish Entries</h2>
              <span style={styles.panelBadge}>{rows.length} rows</span>
            </div>

            <div style={styles.rowsWrap}>
              {rows.map((row, index) => {
                const rowRevenue = row.price * row.quantity;
                const rowCost = row.cost * row.quantity;
                const rowProfit = rowRevenue - rowCost;

                return (
                  <div key={index} style={styles.rowCard}>
                    <div style={styles.rowTop}>
                      <div style={styles.rowNumber}>Dish #{index + 1}</div>
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        style={styles.removeButton}
                      >
                        Remove
                      </button>
                    </div>

                    <div style={styles.fieldGrid}>
                      <div style={styles.fieldWide}>
                        <label style={styles.label}>Dish</label>
                        <select
                          value={row.name}
                          onChange={(e) => handleDishSelect(index, e.target.value)}
                          style={styles.select}
                        >
                          <option value="">Select a dish</option>
                          {groupedOptions.map(([category, dishes]) => (
                            <optgroup key={category} label={category}>
                              {dishes.map((dish) => (
                                <option key={dish.name} value={dish.name}>
                                  {dish.name} — Price {formatCurrency(dish.price)} / Cost {formatCurrency(dish.cost)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={styles.label}>Quantity</label>
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(index, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          style={styles.input}
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Price</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.price}
                          onChange={(e) =>
                            updateRow(index, {
                              price: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          style={styles.input}
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Cost</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.cost}
                          onChange={(e) =>
                            updateRow(index, {
                              cost: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          style={styles.input}
                        />
                      </div>
                    </div>

                    <div style={styles.rowSummary}>
                      <div style={styles.rowSummaryItem}>
                        <span style={styles.rowSummaryLabel}>Revenue</span>
                        <strong style={styles.rowSummaryValue}>{formatCurrency(rowRevenue)}</strong>
                      </div>
                      <div style={styles.rowSummaryItem}>
                        <span style={styles.rowSummaryLabel}>Cost</span>
                        <strong style={styles.rowSummaryValue}>{formatCurrency(rowCost)}</strong>
                      </div>
                      <div style={styles.rowSummaryItem}>
                        <span style={styles.rowSummaryLabel}>Profit</span>
                        <strong style={styles.rowSummaryValue}>{formatCurrency(rowProfit)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.rightPanel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Day Totals</h2>
            </div>

            <div style={styles.totalCard}>
              <span style={styles.totalLabel}>Revenue</span>
              <strong style={styles.totalValue}>{formatCurrency(totals.revenue)}</strong>
            </div>

            <div style={styles.totalCard}>
              <span style={styles.totalLabel}>Cost</span>
              <strong style={styles.totalValue}>{formatCurrency(totals.cost)}</strong>
            </div>

            <div style={styles.totalCard}>
              <span style={styles.totalLabel}>Profit</span>
              <strong style={styles.totalValue}>{formatCurrency(totals.profit)}</strong>
            </div>

            {message ? <div style={styles.successBox}>{message}</div> : null}
            {error ? <div style={styles.errorBox}>{error}</div> : null}

            <div style={styles.infoBox}>
              <div style={styles.infoTitle}>Current Save Payload</div>
              <div style={styles.infoText}>
                Keeps the same payload structure:
              </div>
              <pre style={styles.pre}>
{`{
  date,
  dishes,
  totals: {
    revenue,
    cost,
    profit
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "32px 16px",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  header: {
    marginBottom: "24px",
  },
  eyebrow: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  title: {
    margin: "8px 0 8px 0",
    fontSize: "36px",
    fontWeight: 800,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    fontSize: "16px",
    color: "#475569",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  dateCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "16px",
    minWidth: "260px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  },
  actionWrap: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    borderRadius: "14px",
    background: "#0f172a",
    color: "#ffffff",
    padding: "14px 18px",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "14px",
    background: "#ffffff",
    color: "#0f172a",
    padding: "14px 18px",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 360px",
    gap: "20px",
    alignItems: "start",
  },
  leftPanel: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  },
  rightPanel: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
    position: "sticky",
    top: "20px",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "18px",
  },
  panelTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 800,
    color: "#0f172a",
  },
  panelBadge: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
    background: "#f1f5f9",
    borderRadius: "999px",
    padding: "6px 10px",
  },
  rowsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  rowCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "16px",
    background: "#f8fafc",
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
  },
  rowNumber: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#0f172a",
  },
  removeButton: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#be123c",
    borderRadius: "10px",
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) repeat(3, minmax(120px, 1fr))",
    gap: "12px",
    marginBottom: "14px",
  },
  fieldWide: {
    minWidth: 0,
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#475569",
  },
  select: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "14px",
    background: "#ffffff",
    color: "#0f172a",
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "14px",
    background: "#ffffff",
    color: "#0f172a",
    boxSizing: "border-box",
  },
  dateInput: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "14px",
    background: "#ffffff",
    color: "#0f172a",
    boxSizing: "border-box",
  },
  rowSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
    gap: "12px",
  },
  rowSummaryItem: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
  },
  rowSummaryLabel: {
    display: "block",
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "6px",
  },
  rowSummaryValue: {
    fontSize: "16px",
    color: "#0f172a",
  },
  totalCard: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: "16px",
    padding: "16px",
    marginBottom: "12px",
  },
  totalLabel: {
    display: "block",
    fontSize: "13px",
    color: "#64748b",
    marginBottom: "8px",
  },
  totalValue: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#0f172a",
  },
  successBox: {
    marginTop: "16px",
    border: "1px solid #bbf7d0",
    background: "#f0fdf4",
    color: "#166534",
    borderRadius: "14px",
    padding: "14px",
    fontWeight: 600,
  },
  errorBox: {
    marginTop: "16px",
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#be123c",
    borderRadius: "14px",
    padding: "14px",
    fontWeight: 600,
  },
  infoBox: {
    marginTop: "18px",
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "16px",
  },
  infoTitle: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#0f172a",
    marginBottom: "8px",
  },
  infoText: {
    fontSize: "13px",
    color: "#64748b",
    marginBottom: "10px",
  },
  pre: {
    margin: 0,
    padding: "12px",
    borderRadius: "12px",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: "12px",
    overflowX: "auto",
  },
};