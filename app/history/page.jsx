"use client";

import { useEffect, useMemo, useState } from "react";

const createEmptyDish = () => ({
  name: "",
  qty: "1",
  price: "",
  cost: "",
});

export default function HistoryPage() {
  const [reports, setReports] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editDishes, setEditDishes] = useState([createEmptyDish()]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/history", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to load history.");
      }

      setReports(result.data || []);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to load history.");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-CA").format(date);
  };

  const toggleExpand = (id) => {
    if (editingId === id) return;
    setExpandedId((current) => (current === id ? null : id));
  };

  const startEdit = (report) => {
    const dishes = Array.isArray(report.dishes) && report.dishes.length > 0
      ? report.dishes.map((dish) => ({
          name: dish.name || "",
          qty: String(dish.qty ?? "1"),
          price: String(dish.price ?? ""),
          cost: String(dish.cost ?? ""),
        }))
      : [createEmptyDish()];

    setEditingId(report.id);
    setExpandedId(report.id);
    setEditDate(report.date || "");
    setEditDishes(dishes);
    setMessage("");
    setMessageType("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDate("");
    setEditDishes([createEmptyDish()]);
  };

  const updateDish = (index, field, value) => {
    setEditDishes((current) =>
      current.map((dish, i) =>
        i === index ? { ...dish, [field]: value } : dish
      )
    );
  };

  const addDishRow = () => {
    setEditDishes((current) => [...current, createEmptyDish()]);
  };

  const removeDishRow = (index) => {
    setEditDishes((current) => {
      if (current.length === 1) {
        return [createEmptyDish()];
      }
      return current.filter((_, i) => i !== index);
    });
  };

  const parsedEditDishes = useMemo(() => {
    return editDishes.map((dish) => {
      const qty = Number(dish.qty) || 0;
      const price = Number(dish.price) || 0;
      const cost = Number(dish.cost) || 0;
      const revenue = qty * price;
      const profit = revenue - qty * cost;

      return {
        ...dish,
        qtyNumber: qty,
        priceNumber: price,
        costNumber: cost,
        revenue,
        profit,
      };
    });
  }, [editDishes]);

  const editTotals = useMemo(() => {
    return parsedEditDishes.reduce(
      (acc, dish) => {
        if (
          dish.name.trim() !== "" ||
          dish.qty !== "" ||
          dish.price !== "" ||
          dish.cost !== ""
        ) {
          acc.revenue += dish.revenue;
          acc.cost += dish.qtyNumber * dish.costNumber;
          acc.profit += dish.profit;
        }
        return acc;
      },
      { revenue: 0, cost: 0, profit: 0 }
    );
  }, [parsedEditDishes]);

  const saveEdit = async () => {
    if (!editingId) return;

    const cleanedDishes = parsedEditDishes
      .filter((dish) => dish.name.trim() !== "")
      .map((dish) => ({
        name: dish.name.trim(),
        qty: dish.qtyNumber,
        price: dish.priceNumber,
        cost: dish.costNumber,
        revenue: dish.revenue,
        profit: dish.profit,
      }));

    if (!editDate) {
      setMessageType("error");
      setMessage("Date is required.");
      return;
    }

    if (cleanedDishes.length === 0) {
      setMessageType("error");
      setMessage("Add at least one valid dish.");
      return;
    }

    try {
      setWorkingId(editingId);
      setMessage("");
      setMessageType("");

      const response = await fetch("/api/history", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          date: editDate,
          dishes: cleanedDishes,
          revenue: editTotals.revenue,
          cost: editTotals.cost,
          profit: editTotals.profit,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to update report.");
      }

      setReports((current) =>
        current.map((report) =>
          report.id === editingId ? result.data : report
        )
      );

      setEditingId(null);
      setEditDate("");
      setEditDishes([createEmptyDish()]);
      setMessageType("success");
      setMessage("Report updated successfully.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to update report.");
    } finally {
      setWorkingId(null);
    }
  };

  const deleteReport = async (id) => {
    const confirmed = window.confirm("Delete this report permanently?");
    if (!confirmed) return;

    try {
      setWorkingId(id);
      setMessage("");
      setMessageType("");

      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to delete report.");
      }

      setReports((current) => current.filter((report) => report.id !== id));

      if (expandedId === id) {
        setExpandedId(null);
      }

      if (editingId === id) {
        cancelEdit();
      }

      setMessageType("success");
      setMessage("Report deleted successfully.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to delete report.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerBlock}>
          <div>
            <p style={styles.eyebrow}>Churchill Control System</p>
            <h1 style={styles.title}>History</h1>
            <p style={styles.subtitle}>
              Review, edit, and remove saved daily reports.
            </p>
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

        {loading ? (
          <div style={styles.emptyState}>Loading history...</div>
        ) : reports.length === 0 ? (
          <div style={styles.emptyState}>No saved reports yet.</div>
        ) : (
          <div style={styles.list}>
            {reports.map((report) => {
              const isExpanded = expandedId === report.id;
              const isEditing = editingId === report.id;
              const isWorking = workingId === report.id;

              return (
                <div key={report.id} style={styles.card}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(report.id)}
                    style={styles.cardHeader}
                  >
                    <div style={styles.cardHeaderLeft}>
                      <div style={styles.cardDate}>{formatDate(report.date)}</div>
                      <div style={styles.cardMeta}>
                        Saved report #{report.id}
                      </div>
                    </div>

                    <div style={styles.cardHeaderRight}>
                      <div style={styles.summaryItem}>
                        <span style={styles.summaryLabel}>Revenue</span>
                        <strong style={styles.summaryValue}>
                          {formatMoney(report.revenue)}
                        </strong>
                      </div>
                      <div style={styles.summaryItem}>
                        <span style={styles.summaryLabel}>Cost</span>
                        <strong style={styles.summaryValue}>
                          {formatMoney(report.cost)}
                        </strong>
                      </div>
                      <div style={styles.summaryItem}>
                        <span style={styles.summaryLabel}>Profit</span>
                        <strong
                          style={{
                            ...styles.summaryValue,
                            color:
                              Number(report.profit) < 0 ? "#b42318" : "#067647",
                          }}
                        >
                          {formatMoney(report.profit)}
                        </strong>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div style={styles.cardBody}>
                      {!isEditing ? (
                        <>
                          <div style={styles.actionBar}>
                            <button
                              type="button"
                              onClick={() => startEdit(report)}
                              style={styles.secondaryButton}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteReport(report.id)}
                              disabled={isWorking}
                              style={styles.deleteButton}
                            >
                              {isWorking ? "Deleting..." : "Delete"}
                            </button>
                          </div>

                          <div style={styles.totalsGrid}>
                            <div style={styles.totalCard}>
                              <span style={styles.totalLabel}>Revenue</span>
                              <strong style={styles.totalValue}>
                                {formatMoney(report.revenue)}
                              </strong>
                            </div>
                            <div style={styles.totalCard}>
                              <span style={styles.totalLabel}>Cost</span>
                              <strong style={styles.totalValue}>
                                {formatMoney(report.cost)}
                              </strong>
                            </div>
                            <div style={styles.totalCard}>
                              <span style={styles.totalLabel}>Profit</span>
                              <strong
                                style={{
                                  ...styles.totalValue,
                                  color:
                                    Number(report.profit) < 0
                                      ? "#b42318"
                                      : "#067647",
                                }}
                              >
                                {formatMoney(report.profit)}
                              </strong>
                            </div>
                          </div>

                          <div style={styles.tableWrap}>
                            <div style={styles.tableHeader}>
                              <div style={{ ...styles.headerCell, flex: 2 }}>
                                Dish
                              </div>
                              <div style={styles.headerCell}>Qty</div>
                              <div style={styles.headerCell}>Price</div>
                              <div style={styles.headerCell}>Cost</div>
                              <div style={styles.headerCell}>Revenue</div>
                              <div style={styles.headerCell}>Profit</div>
                            </div>

                            {(report.dishes || []).map((dish, index) => {
                              const qty = Number(dish.qty) || 0;
                              const price = Number(dish.price) || 0;
                              const cost = Number(dish.cost) || 0;
                              const revenue =
                                typeof dish.revenue !== "undefined"
                                  ? Number(dish.revenue) || 0
                                  : qty * price;
                              const profit =
                                typeof dish.profit !== "undefined"
                                  ? Number(dish.profit) || 0
                                  : revenue - qty * cost;

                              return (
                                <div key={index} style={styles.tableRow}>
                                  <div style={{ ...styles.bodyCell, flex: 2 }}>
                                    {dish.name}
                                  </div>
                                  <div style={styles.bodyCell}>{qty}</div>
                                  <div style={styles.bodyCell}>
                                    {formatMoney(price)}
                                  </div>
                                  <div style={styles.bodyCell}>
                                    {formatMoney(cost)}
                                  </div>
                                  <div style={styles.bodyCell}>
                                    {formatMoney(revenue)}
                                  </div>
                                  <div
                                    style={{
                                      ...styles.bodyCell,
                                      color: profit < 0 ? "#b42318" : "#101828",
                                    }}
                                  >
                                    {formatMoney(profit)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={styles.editTopBar}>
                            <div style={styles.dateField}>
                              <label htmlFor="edit-date" style={styles.label}>
                                Date
                              </label>
                              <input
                                id="edit-date"
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                style={styles.dateInput}
                              />
                            </div>

                            <div style={styles.editButtons}>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                style={styles.ghostButton}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={workingId === editingId}
                                style={styles.primaryButton}
                              >
                                {workingId === editingId ? "Saving..." : "Save Changes"}
                              </button>
                            </div>
                          </div>

                          <div style={styles.totalsGrid}>
                            <div style={styles.totalCard}>
                              <span style={styles.totalLabel}>Revenue</span>
                              <strong style={styles.totalValue}>
                                {formatMoney(editTotals.revenue)}
                              </strong>
                            </div>
                            <div style={styles.totalCard}>
                              <span style={styles.totalLabel}>Cost</span>
                              <strong style={styles.totalValue}>
                                {formatMoney(editTotals.cost)}
                              </strong>
                            </div>
                            <div style={styles.totalCard}>
                              <span style={styles.totalLabel}>Profit</span>
                              <strong
                                style={{
                                  ...styles.totalValue,
                                  color:
                                    editTotals.profit < 0 ? "#b42318" : "#067647",
                                }}
                              >
                                {formatMoney(editTotals.profit)}
                              </strong>
                            </div>
                          </div>

                          <div style={styles.tableWrap}>
                            <div style={styles.tableHeader}>
                              <div style={{ ...styles.headerCell, flex: 2 }}>
                                Dish
                              </div>
                              <div style={styles.headerCell}>Qty</div>
                              <div style={styles.headerCell}>Price</div>
                              <div style={styles.headerCell}>Cost</div>
                              <div style={styles.headerCell}>Revenue</div>
                              <div style={styles.headerCell}>Profit</div>
                              <div style={styles.headerCell}>Action</div>
                            </div>

                            {parsedEditDishes.map((dish, index) => (
                              <div key={index} style={styles.tableRow}>
                                <div style={{ ...styles.bodyCell, flex: 2 }}>
                                  <input
                                    type="text"
                                    value={dish.name}
                                    onChange={(e) =>
                                      updateDish(index, "name", e.target.value)
                                    }
                                    placeholder="Dish name"
                                    style={styles.textInput}
                                  />
                                </div>
                                <div style={styles.bodyCell}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={dish.qty}
                                    onChange={(e) =>
                                      updateDish(index, "qty", e.target.value)
                                    }
                                    placeholder="0"
                                    style={styles.numberInput}
                                  />
                                </div>
                                <div style={styles.bodyCell}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={dish.price}
                                    onChange={(e) =>
                                      updateDish(index, "price", e.target.value)
                                    }
                                    placeholder="0.00"
                                    style={styles.numberInput}
                                  />
                                </div>
                                <div style={styles.bodyCell}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={dish.cost}
                                    onChange={(e) =>
                                      updateDish(index, "cost", e.target.value)
                                    }
                                    placeholder="0.00"
                                    style={styles.numberInput}
                                  />
                                </div>
                                <div style={styles.bodyCell}>
                                  {formatMoney(dish.revenue)}
                                </div>
                                <div
                                  style={{
                                    ...styles.bodyCell,
                                    color:
                                      dish.profit < 0 ? "#b42318" : "#101828",
                                  }}
                                >
                                  {formatMoney(dish.profit)}
                                </div>
                                <div style={styles.bodyCell}>
                                  <button
                                    type="button"
                                    onClick={() => removeDishRow(index)}
                                    style={styles.rowDeleteButton}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div style={styles.editFooter}>
                            <button
                              type="button"
                              onClick={addDishRow}
                              style={styles.secondaryButton}
                            >
                              + Add Dish
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteReport(report.id)}
                              disabled={isWorking}
                              style={styles.deleteButton}
                            >
                              {isWorking ? "Deleting..." : "Delete Report"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
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
    maxWidth: "1200px",
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(16, 24, 40, 0.06)",
  },
  headerBlock: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "20px",
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
  message: {
    marginBottom: "16px",
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
  emptyState: {
    border: "1px dashed #d0d5dd",
    borderRadius: "16px",
    padding: "28px",
    textAlign: "center",
    color: "#667085",
    background: "#fcfcfd",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  card: {
    border: "1px solid #eaecf0",
    borderRadius: "18px",
    overflow: "hidden",
    background: "#ffffff",
  },
  cardHeader: {
    width: "100%",
    border: "none",
    background: "#fcfcfd",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    textAlign: "left",
    cursor: "pointer",
  },
  cardHeaderLeft: {
    minWidth: "180px",
  },
  cardDate: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#101828",
  },
  cardMeta: {
    marginTop: "4px",
    fontSize: "13px",
    color: "#667085",
  },
  cardHeaderRight: {
    display: "flex",
    flexWrap: "wrap",
    gap: "18px",
    justifyContent: "flex-end",
  },
  summaryItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    minWidth: "110px",
  },
  summaryLabel: {
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#667085",
  },
  summaryValue: {
    fontSize: "16px",
    color: "#101828",
  },
  cardBody: {
    borderTop: "1px solid #eaecf0",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  actionBar: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },
  editTopBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "16px",
    flexWrap: "wrap",
  },
  dateField: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "220px",
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
  editButtons: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  totalsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  },
  totalCard: {
    border: "1px solid #eaecf0",
    borderRadius: "16px",
    padding: "16px",
    background: "#fcfcfd",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  totalLabel: {
    fontSize: "13px",
    color: "#667085",
    fontWeight: 600,
  },
  totalValue: {
    fontSize: "26px",
    lineHeight: 1,
    color: "#101828",
  },
  tableWrap: {
    border: "1px solid #eaecf0",
    borderRadius: "16px",
    overflowX: "auto",
    background: "#fff",
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    minWidth: "900px",
    background: "#f9fafb",
    borderBottom: "1px solid #eaecf0",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    minWidth: "900px",
    borderBottom: "1px solid #f2f4f7",
  },
  headerCell: {
    flex: 1,
    padding: "14px 12px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#475467",
  },
  bodyCell: {
    flex: 1,
    padding: "12px",
    fontSize: "14px",
    color: "#101828",
  },
  textInput: {
    width: "100%",
    height: "40px",
    border: "1px solid #d0d5dd",
    borderRadius: "10px",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    background: "#fff",
  },
  numberInput: {
    width: "100%",
    height: "40px",
    border: "1px solid #d0d5dd",
    borderRadius: "10px",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    background: "#fff",
    textAlign: "right",
  },
  editFooter: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  primaryButton: {
    height: "46px",
    padding: "0 18px",
    borderRadius: "12px",
    border: "none",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
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
  deleteButton: {
    height: "46px",
    padding: "0 16px",
    borderRadius: "12px",
    border: "1px solid #fecdca",
    background: "#fef3f2",
    color: "#b42318",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
  rowDeleteButton: {
    height: "36px",
    padding: "0 12px",
    borderRadius: "10px",
    border: "1px solid #fecdca",
    background: "#fff5f4",
    color: "#b42318",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
};