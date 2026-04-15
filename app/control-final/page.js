"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const emptyDish = () => ({
  name: "",
  qty: "1",
  price: "",
  cost: "",
});

export default function ControlFinal() {
  const [reportDate, setReportDate] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });

  const [dishes, setDishes] = useState([
    emptyDish(),
    emptyDish(),
    emptyDish(),
    emptyDish(),
  ]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const nameRefs = useRef([]);

  const parsedDishes = useMemo(() => {
    return dishes.map((dish, index) => {
      const qty = Number(dish.qty) || 0;
      const price = Number(dish.price) || 0;
      const cost = Number(dish.cost) || 0;
      const revenue = qty * price;
      const totalCost = qty * cost;
      const profit = revenue - totalCost;

      return {
        ...dish,
        index,
        qtyNumber: qty,
        priceNumber: price,
        costNumber: cost,
        revenue,
        totalCost,
        profit,
      };
    });
  }, [dishes]);

  const activeDishes = useMemo(() => {
    return parsedDishes.filter((dish) => {
      return (
        dish.name.trim() !== "" ||
        dish.qty !== "" ||
        dish.price !== "" ||
        dish.cost !== ""
      );
    });
  }, [parsedDishes]);

  const totals = useMemo(() => {
    return activeDishes.reduce(
      (acc, dish) => {
        acc.items += dish.qtyNumber;
        acc.revenue += dish.revenue;
        acc.cost += dish.totalCost;
        acc.profit += dish.profit;
        return acc;
      },
      { items: 0, revenue: 0, cost: 0, profit: 0 }
    );
  }, [activeDishes]);

  useEffect(() => {
    if (dishes.length === 0) {
      setDishes([emptyDish()]);
    }
  }, [dishes]);

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const updateDish = (index, field, value) => {
    setDishes((current) =>
      current.map((dish, i) =>
        i === index ? { ...dish, [field]: value } : dish
      )
    );
  };

  const addRow = (focusIndex) => {
    setDishes((current) => {
      const next = [...current, emptyDish()];
      return next;
    });

    requestAnimationFrame(() => {
      const targetIndex =
        typeof focusIndex === "number" ? focusIndex : dishes.length;
      nameRefs.current[targetIndex]?.focus();
    });
  };

  const removeRow = (index) => {
    setDishes((current) => {
      if (current.length === 1) {
        return [emptyDish()];
      }

      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [emptyDish()];
    });

    requestAnimationFrame(() => {
      const previousIndex = index > 0 ? index - 1 : 0;
      nameRefs.current[previousIndex]?.focus();
    });
  };

  const clearAll = () => {
    setDishes([emptyDish(), emptyDish(), emptyDish(), emptyDish()]);
    setMessage("");
    setMessageType("");
    requestAnimationFrame(() => {
      nameRefs.current[0]?.focus();
    });
  };

  const handleKeyDown = (event, index) => {
    if (event.key === "Enter") {
      event.preventDefault();

      if (index === dishes.length - 1) {
        addRow(index + 1);
      } else {
        nameRefs.current[index + 1]?.focus();
      }
    }

    if (
      event.key === "Backspace" &&
      dishes[index] &&
      dishes[index].name === "" &&
      dishes[index].qty === "" &&
      dishes[index].price === "" &&
      dishes[index].cost === "" &&
      dishes.length > 1
    ) {
      event.preventDefault();
      removeRow(index);
    }
  };

  const saveDay = async () => {
    const cleanedDishes = activeDishes
      .filter((dish) => dish.name.trim() !== "")
      .map((dish) => ({
        name: dish.name.trim(),
        qty: dish.qtyNumber,
        price: dish.priceNumber,
        cost: dish.costNumber,
        revenue: dish.revenue,
        totalCost: dish.totalCost,
        profit: dish.profit,
      }));

    if (cleanedDishes.length === 0) {
      setMessageType("error");
      setMessage("Add at least one dish before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/save-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: reportDate,
          dishes: cleanedDishes,
          revenue: totals.revenue,
          cost: totals.cost,
          profit: totals.profit,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save report.");
      }

      setMessageType("success");
      setMessage("Day saved successfully.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Churchill Control System</p>
            <h1 style={styles.title}>Daily Control Panel</h1>
            <p style={styles.subtitle}>
              Fast daily entry for dishes, revenue, cost, and profit.
            </p>
          </div>

          <div style={styles.dateBox}>
            <label htmlFor="report-date" style={styles.label}>
              Report Date
            </label>
            <input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              style={styles.dateInput}
            />
          </div>
        </div>

        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Items Sold</span>
            <strong style={styles.summaryValue}>{totals.items}</strong>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Revenue</span>
            <strong style={styles.summaryValue}>
              {formatMoney(totals.revenue)}
            </strong>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Cost</span>
            <strong style={styles.summaryValue}>{formatMoney(totals.cost)}</strong>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Profit</span>
            <strong
              style={{
                ...styles.summaryValue,
                color: totals.profit < 0 ? "#b42318" : "#067647",
              }}
            >
              {formatMoney(totals.profit)}
            </strong>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <div style={styles.tableHeaderRow}>
            <div style={{ ...styles.headerCell, flex: 2.2 }}>Dish</div>
            <div style={{ ...styles.headerCell, flex: 0.8 }}>Qty</div>
            <div style={{ ...styles.headerCell, flex: 1 }}>Sell Price</div>
            <div style={{ ...styles.headerCell, flex: 1 }}>Unit Cost</div>
            <div style={{ ...styles.headerCell, flex: 1 }}>Revenue</div>
            <div style={{ ...styles.headerCell, flex: 1 }}>Profit</div>
            <div style={{ ...styles.headerCell, flex: 0.6 }}>Action</div>
          </div>

          {parsedDishes.map((dish, index) => (
            <div key={index} style={styles.row}>
              <div style={{ ...styles.cell, flex: 2.2 }}>
                <input
                  ref={(el) => {
                    nameRefs.current[index] = el;
                  }}
                  type="text"
                  placeholder="Dish name"
                  value={dish.name}
                  onChange={(e) => updateDish(index, "name", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  style={styles.textInput}
                />
              </div>

              <div style={{ ...styles.cell, flex: 0.8 }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={dish.qty}
                  onChange={(e) => updateDish(index, "qty", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  style={styles.numberInput}
                />
              </div>

              <div style={{ ...styles.cell, flex: 1 }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={dish.price}
                  onChange={(e) => updateDish(index, "price", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  style={styles.numberInput}
                />
              </div>

              <div style={{ ...styles.cell, flex: 1 }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={dish.cost}
                  onChange={(e) => updateDish(index, "cost", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  style={styles.numberInput}
                />
              </div>

              <div style={{ ...styles.cell, flex: 1 }}>
                <div style={styles.calculatedCell}>
                  {formatMoney(dish.revenue)}
                </div>
              </div>

              <div style={{ ...styles.cell, flex: 1 }}>
                <div
                  style={{
                    ...styles.calculatedCell,
                    color: dish.profit < 0 ? "#b42318" : "#111827",
                  }}
                >
                  {formatMoney(dish.profit)}
                </div>
              </div>

              <div style={{ ...styles.cell, flex: 0.6 }}>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  style={styles.removeButton}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.bottomBar}>
          <div style={styles.leftActions}>
            <button type="button" onClick={() => addRow()} style={styles.secondaryButton}>
              + Add Dish
            </button>
            <button type="button" onClick={clearAll} style={styles.ghostButton}>
              Clear
            </button>
          </div>

          <div style={styles.rightActions}>
            <div style={styles.totalBox}>
              <span style={styles.totalLabel}>Total Profit</span>
              <strong
                style={{
                  ...styles.totalValue,
                  color: totals.profit < 0 ? "#b42318" : "#067647",
                }}
              >
                {formatMoney(totals.profit)}
              </strong>
            </div>

            <button
              type="button"
              onClick={saveDay}
              disabled={saving}
              style={{
                ...styles.saveButton,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Day"}
            </button>
          </div>
        </div>

        {message ? (
          <div
            style={{
              ...styles.message,
              ...(messageType === "success"
                ? styles.messageSuccess
                : styles.messageError),
            }}
          >
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "32px 20px",
  },
  container: {
    maxWidth: "1280px",
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(16, 24, 40, 0.06)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  eyebrow: {
    margin: "0 0 6px 0",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#667085",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1.1,
    color: "#101828",
  },
  subtitle: {
    margin: "8px 0 0 0",
    fontSize: "15px",
    color: "#667085",
  },
  dateBox: {
    minWidth: "220px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#344054",
  },
  dateInput: {
    height: "44px",
    borderRadius: "12px",
    border: "1px solid #d0d5dd",
    padding: "0 14px",
    fontSize: "14px",
    outline: "none",
    background: "#fff",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "24px",
  },
  summaryCard: {
    border: "1px solid #eaecf0",
    borderRadius: "16px",
    padding: "16px",
    background: "#fcfcfd",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  summaryLabel: {
    fontSize: "13px",
    color: "#667085",
    fontWeight: 600,
  },
  summaryValue: {
    fontSize: "28px",
    color: "#101828",
    lineHeight: 1,
  },
  tableWrap: {
    border: "1px solid #eaecf0",
    borderRadius: "18px",
    overflow: "hidden",
    background: "#fff",
  },
  tableHeaderRow: {
    display: "flex",
    alignItems: "center",
    background: "#f9fafb",
    borderBottom: "1px solid #eaecf0",
    minWidth: "980px",
  },
  headerCell: {
    padding: "14px 12px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#475467",
  },
  row: {
    display: "flex",
    alignItems: "center",
    minWidth: "980px",
    borderBottom: "1px solid #f2f4f7",
  },
  cell: {
    padding: "10px 12px",
  },
  textInput: {
    width: "100%",
    height: "42px",
    border: "1px solid #d0d5dd",
    borderRadius: "10px",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    background: "#fff",
  },
  numberInput: {
    width: "100%",
    height: "42px",
    border: "1px solid #d0d5dd",
    borderRadius: "10px",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    background: "#fff",
    textAlign: "right",
  },
  calculatedCell: {
    height: "42px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "0 4px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#101828",
  },
  removeButton: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    border: "1px solid #eaecf0",
    background: "#fff",
    fontSize: "24px",
    lineHeight: 1,
    color: "#b42318",
    cursor: "pointer",
  },
  bottomBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginTop: "20px",
  },
  leftActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  rightActions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  secondaryButton: {
    height: "46px",
    padding: "0 16px",
    borderRadius: "12px",
    border: "1px solid #d0d5dd",
    background: "#fff",
    color: "#101828",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  },
  ghostButton: {
    height: "46px",
    padding: "0 16px",
    borderRadius: "12px",
    border: "1px solid #eaecf0",
    background: "#f9fafb",
    color: "#344054",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  },
  totalBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    minWidth: "140px",
  },
  totalLabel: {
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#667085",
  },
  totalValue: {
    fontSize: "28px",
    lineHeight: 1.1,
  },
  saveButton: {
    height: "50px",
    padding: "0 22px",
    borderRadius: "12px",
    border: "none",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "15px",
  },
  message: {
    marginTop: "16px",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 600,
  },
  messageSuccess: {
    background: "#ecfdf3",
    color: "#067647",
    border: "1px solid #abefc6",
  },
  messageError: {
    background: "#fef3f2",
    color: "#b42318",
    border: "1px solid #fecdca",
  },
};