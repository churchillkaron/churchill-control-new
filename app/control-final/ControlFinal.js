"use client";

import { useMemo, useState } from "react";

const COLORS = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  khaki: "#b7a57a",
  khakiDark: "#8f7d56",
  white: "#ffffff",
  good: "#5f7a52",
  bad: "#9c5f4a",
  warn: "#b0813f",
};

const MENU = [
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
  { name: "Potato Gratin", category: "Side", price: 120, cost: 30.34 },
  { name: "Crispy Potato Wedges", category: "Side", price: 100, cost: 18.34 },
  { name: "Cauliflower Puree", category: "Side", price: 120, cost: 27.44 },
  { name: "Tom Yum Goong", category: "Soup", price: 180, cost: 94.4 },
  { name: "Tom Kha Gai", category: "Soup", price: 170, cost: 70.1 },
  { name: "Pad Thai", category: "Main", price: 160, cost: 56.55 },
  { name: "Pad Ka Prow", category: "Main", price: 150, cost: 36.905 },
  { name: "Stir-Fried Chicken with Cashew Nuts", category: "Main", price: 180, cost: 68.04 },
  { name: "Beef with Oyster Sauce", category: "Main", price: 220, cost: 160.525 },
  { name: "Massaman Curry", category: "Main", price: 180, cost: 90.96 },
  { name: "Green Curry", category: "Main", price: 170, cost: 80.77 },
  { name: "Panang Curry", category: "Main", price: 175, cost: 71.9 },
  { name: "Pineapple Fried Rice", category: "Main", price: 160, cost: 54.36 },
];

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function classifyDish(avgQty, avgProfit, qty, profit) {
  if (qty >= avgQty && profit >= avgProfit) return "Star";
  if (qty >= avgQty && profit < avgProfit) return "Plowhorse";
  if (qty < avgQty && profit >= avgProfit) return "Puzzle";
  return "Dog";
}

function scoreTone(label) {
  if (label === "Star") return COLORS.good;
  if (label === "Plowhorse") return COLORS.warn;
  if (label === "Puzzle") return COLORS.khakiDark;
  return COLORS.bad;
}

function Card({ title, children, right }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(92, 77, 50, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function ControlFinal() {
  const [businessDate, setBusinessDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedDish, setSelectedDish] = useState(MENU[0].name);
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const selectedData = useMemo(() => {
    return MENU.find((dish) => dish.name === selectedDish) || MENU[0];
  }, [selectedDish]);

  const totals = useMemo(() => {
    const revenue = lines.reduce((sum, line) => sum + line.revenue, 0);
    const cost = lines.reduce((sum, line) => sum + line.costTotal, 0);
    const profit = revenue - cost;
    const margin = revenue ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin };
  }, [lines]);

  const lineAnalytics = useMemo(() => {
    const merged = {};

    lines.forEach((line) => {
      if (!merged[line.name]) {
        merged[line.name] = {
          name: line.name,
          category: line.category,
          qty: 0,
          revenue: 0,
          costTotal: 0,
          profit: 0,
          price: line.price,
          cost: line.cost,
        };
      }

      merged[line.name].qty += line.qty;
      merged[line.name].revenue += line.revenue;
      merged[line.name].costTotal += line.costTotal;
      merged[line.name].profit += line.profit;
    });

    const stats = Object.values(merged);
    const avgQty =
      stats.length > 0
        ? stats.reduce((sum, item) => sum + item.qty, 0) / stats.length
        : 0;
    const avgProfit =
      stats.length > 0
        ? stats.reduce((sum, item) => sum + item.profit, 0) / stats.length
        : 0;

    return stats
      .map((item) => ({
        ...item,
        classification: classifyDish(avgQty, avgProfit, item.qty, item.profit),
        recommendedPrice:
          item.cost > 0 ? Math.ceil((item.cost / 0.3) / 5) * 5 : item.price,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [lines]);

  const aiInsights = useMemo(() => {
    const out = [];

    if (lines.length === 0) {
      out.push("No sales data yet. Start by adding dishes from the dropdown.");
      return out;
    }

    if (totals.margin >= 30) {
      out.push("Overall margin is strong. Current pricing and mix are healthy.");
    } else if (totals.margin >= 20) {
      out.push("Overall margin is acceptable, but there is room for price optimisation.");
    } else {
      out.push("Overall margin is low. Review cost-heavy dishes and weak pricing.");
    }

    const topDish = lineAnalytics[0];
    const weakDish = [...lineAnalytics].sort((a, b) => a.profit - b.profit)[0];

    if (topDish) {
      out.push(`Top dish today: ${topDish.name} with THB ${money(topDish.profit)} profit.`);
    }

    if (weakDish) {
      if (weakDish.classification === "Dog") {
        out.push(`${weakDish.name} is classed as Dog. Consider replacing, repricing, or reducing focus.`);
      } else if (weakDish.classification === "Plowhorse") {
        out.push(`${weakDish.name} sells well but margin is weak. Consider a controlled price increase.`);
      } else if (weakDish.classification === "Puzzle") {
        out.push(`${weakDish.name} has good profit potential but low quantity. Promote it more visibly.`);
      }
    }

    const lowMargin = lineAnalytics.filter((dish) => dish.cost > 0 && (dish.profit / dish.revenue) * 100 < 25);
    if (lowMargin.length > 0) {
      out.push(`Low-margin warning on ${lowMargin[0].name}. Recommended price target is THB ${money(lowMargin[0].recommendedPrice)}.`);
    }

    return out;
  }, [lines, totals.margin, lineAnalytics]);

  const addDishLine = () => {
    if (!selectedData || quantity <= 0) return;

    const qty = Number(quantity || 0);
    const revenue = selectedData.price * qty;
    const costTotal = selectedData.cost * qty;
    const profit = revenue - costTotal;

    const newLine = {
      id: `${selectedData.name}-${Date.now()}`,
      name: selectedData.name,
      category: selectedData.category,
      qty,
      price: selectedData.price,
      cost: selectedData.cost,
      revenue,
      costTotal,
      profit,
    };

    setLines((prev) => [...prev, newLine]);
    setSaveMessage("");
  };

  const removeLine = (id) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
    setSaveMessage("");
  };

  const saveDay = async () => {
    try {
      setSaving(true);
      setSaveMessage("");

      const payload = {
        date: businessDate,
        dishes: lineAnalytics.map((dish) => ({
          name: dish.name,
          category: dish.category,
          quantity: dish.qty,
          price: dish.price,
          cost: dish.costTotal,
          revenue: dish.revenue,
          profit: dish.profit,
          menu_class: dish.classification,
          recommended_price: dish.recommendedPrice,
        })),
        revenue: Number(totals.revenue.toFixed(2)),
        cost: Number(totals.cost.toFixed(2)),
        profit: Number(totals.profit.toFixed(2)),
      };

      const res = await fetch("/api/save-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save day.");
      }

      setSaveMessage("Day saved successfully.");
    } catch (error) {
      setSaveMessage(error.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "32px 24px 50px",
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #efe7d6 0%, #ddd0b4 100%)",
            border: `1px solid ${COLORS.line}`,
            borderRadius: 24,
            padding: 28,
          }}
        >
          <div
            style={{
              color: COLORS.khakiDark,
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 800,
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            Control Panel
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 46,
              lineHeight: 1.05,
            }}
          >
            Churchill Control Panel
          </h1>

          <p
            style={{
              marginTop: 14,
              color: COLORS.muted,
              fontSize: 17,
              maxWidth: 900,
              lineHeight: 1.6,
            }}
          >
            Daily operations, menu performance, AI decision support, and save-day control in khaki mode.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <Card title="Revenue">
            <div style={{ fontSize: 34, fontWeight: 900 }}>THB {money(totals.revenue)}</div>
          </Card>
          <Card title="Cost">
            <div style={{ fontSize: 34, fontWeight: 900 }}>THB {money(totals.cost)}</div>
          </Card>
          <Card title="Profit">
            <div style={{ fontSize: 34, fontWeight: 900, color: totals.profit >= 0 ? COLORS.good : COLORS.bad }}>
              THB {money(totals.profit)}
            </div>
          </Card>
          <Card title="Margin">
            <div style={{ fontSize: 34, fontWeight: 900 }}>{percent(totals.margin)}</div>
          </Card>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 18,
          }}
        >
          <Card
            title="Dish Entry"
            right={
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                style={{
                  background: COLORS.white,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: COLORS.text,
                }}
              />
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr auto",
                gap: 12,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Dish</div>
                <select
                  value={selectedDish}
                  onChange={(e) => setSelectedDish(e.target.value)}
                  style={{
                    width: "100%",
                    background: COLORS.white,
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    color: COLORS.text,
                    fontSize: 15,
                  }}
                >
                  {MENU.map((dish) => (
                    <option key={dish.name} value={dish.name}>
                      {dish.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Qty</div>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  style={{
                    width: "100%",
                    background: COLORS.white,
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    color: COLORS.text,
                    fontSize: 15,
                  }}
                />
              </div>

              <button
                onClick={addDishLine}
                style={{
                  background: COLORS.khakiDark,
                  color: COLORS.white,
                  border: "none",
                  borderRadius: 12,
                  padding: "13px 18px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Add Dish
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: "#f7f1e4",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ color: COLORS.muted, fontSize: 12 }}>Category</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedData.category}</div>
              </div>

              <div
                style={{
                  background: "#f7f1e4",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ color: COLORS.muted, fontSize: 12 }}>Selling Price</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>THB {money(selectedData.price)}</div>
              </div>

              <div
                style={{
                  background: "#f7f1e4",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ color: COLORS.muted, fontSize: 12 }}>Recipe Cost</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>THB {money(selectedData.cost)}</div>
              </div>

              <div
                style={{
                  background: "#f7f1e4",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ color: COLORS.muted, fontSize: 12 }}>Target Price</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  THB {money(Math.ceil((selectedData.cost / 0.3) / 5) * 5)}
                </div>
              </div>
            </div>
          </Card>

          <Card title="AI Manager">
            <div style={{ display: "grid", gap: 12 }}>
              {aiInsights.map((insight, index) => (
                <div
                  key={index}
                  style={{
                    background: "#f7f1e4",
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 14,
                    padding: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {insight}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18 }}>
              <button
                onClick={saveDay}
                disabled={saving || lines.length === 0}
                style={{
                  background: saving || lines.length === 0 ? "#bfb39a" : COLORS.good,
                  color: COLORS.white,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px 18px",
                  fontWeight: 800,
                  cursor: saving || lines.length === 0 ? "not-allowed" : "pointer",
                  width: "100%",
                }}
              >
                {saving ? "Saving..." : "Save Day"}
              </button>

              {saveMessage ? (
                <div
                  style={{
                    marginTop: 12,
                    color: saveMessage.toLowerCase().includes("success") ? COLORS.good : COLORS.bad,
                    fontWeight: 700,
                  }}
                >
                  {saveMessage}
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <Card title="Live Sales Lines">
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 900,
              }}
            >
              <thead>
                <tr style={{ background: "#efe7d6" }}>
                  {["Dish", "Category", "Qty", "Price", "Cost", "Revenue", "Profit", "Action"].map((head) => (
                    <th
                      key={head}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderBottom: `1px solid ${COLORS.line}`,
                        fontSize: 13,
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: 20, color: COLORS.muted }}>
                      No dishes added yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>{line.name}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>{line.category}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>{line.qty}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(line.price)}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(line.costTotal)}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(line.revenue)}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}`, color: line.profit >= 0 ? COLORS.good : COLORS.bad }}>
                        THB {money(line.profit)}
                      </td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>
                        <button
                          onClick={() => removeLine(line.id)}
                          style={{
                            background: COLORS.bad,
                            color: COLORS.white,
                            border: "none",
                            borderRadius: 10,
                            padding: "8px 12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Menu Engineering">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              marginBottom: 16,
            }}
          >
            {["Star", "Plowhorse", "Puzzle", "Dog"].map((label) => {
              const count = lineAnalytics.filter((dish) => dish.classification === label).length;
              return (
                <div
                  key={label}
                  style={{
                    background: "#f7f1e4",
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: scoreTone(label) }}>{count}</div>
                </div>
              );
            })}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 980,
              }}
            >
              <thead>
                <tr style={{ background: "#efe7d6" }}>
                  {["Dish", "Qty", "Revenue", "Profit", "Menu Class", "Current Price", "Recommended Price"].map((head) => (
                    <th
                      key={head}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderBottom: `1px solid ${COLORS.line}`,
                        fontSize: 13,
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineAnalytics.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: 20, color: COLORS.muted }}>
                      Add dish sales to activate menu engineering.
                    </td>
                  </tr>
                ) : (
                  lineAnalytics.map((dish) => (
                    <tr key={dish.name}>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>{dish.name}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>{dish.qty}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(dish.revenue)}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(dish.profit)}</td>
                      <td
                        style={{
                          padding: 12,
                          borderBottom: `1px solid ${COLORS.line}`,
                          fontWeight: 800,
                          color: scoreTone(dish.classification),
                        }}
                      >
                        {dish.classification}
                      </td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(dish.price)}</td>
                      <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.line}` }}>THB {money(dish.recommendedPrice)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}