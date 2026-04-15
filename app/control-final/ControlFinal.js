"use client";

import { useEffect, useMemo, useState } from "react";

const DISH_CATALOG = [
  { name: "Beef Carpaccio", category: "Starter", price: 320, cost: 110.72, par: 10 },
  { name: "Chili & Garlic Prawns", category: "Starter", price: 320, cost: 74.32, par: 10 },
  { name: "Signature Bruschetta", category: "Starter", price: 280, cost: 62.38, par: 10 },
  { name: "Seared Scallops", category: "Starter", price: 520, cost: 175.72, par: 10 },
  { name: "Mango & Tomato Salad", category: "Light", price: 220, cost: 16.97, par: 10 },
  { name: "Churchill Beef Short Ribs", category: "Main", price: 690, cost: 200.02, par: 10 },
  { name: "Ribeye Steak", category: "Main", price: 950, cost: 356.77, par: 10 },
  { name: "Beef Tenderloin", category: "Main", price: 950, cost: 311.16, par: 10 },
  { name: "Pork Tenderloin", category: "Main", price: 490, cost: 162.91, par: 10 },
  { name: "Salmon", category: "Main", price: 620, cost: 235.93, par: 10 },
  { name: "Churchill Sambal Half Chicken", category: "Main", price: 420, cost: 128.07, par: 10 },
  { name: "Veal Stew", category: "Main", price: 620, cost: 168.29, par: 10 },
  { name: "Potato Gratin", category: "Side", price: 160, cost: 36.47, par: 10 },
  { name: "Crispy Potato Wedges", category: "Side", price: 140, cost: 17.18, par: 10 },
  { name: "Cauliflower Puree", category: "Side", price: 170, cost: 36.26, par: 10 },
  { name: "Tom Yum Goong", category: "Soup", price: 280, cost: 83.18, par: 10 },
  { name: "Tom Kha Gai", category: "Soup", price: 240, cost: 52.56, par: 10 },
  { name: "Pad Thai", category: "Main", price: 260, cost: 46.63, par: 10 },
  { name: "Pad Ka Prow", category: "Main", price: 240, cost: 47.01, par: 10 },
  { name: "Stir-Fried Chicken with Cashew Nuts", category: "Main", price: 260, cost: 53.56, par: 10 },
  { name: "Beef with Oyster Sauce", category: "Main", price: 320, cost: 111.05, par: 10 },
  { name: "Massaman Curry", category: "Main", price: 320, cost: 80.08, par: 10 },
  { name: "Green Curry", category: "Main", price: 280, cost: 52.04, par: 10 },
  { name: "Panang Curry", category: "Main", price: 280, cost: 63.72, par: 10 },
  { name: "Pineapple Fried Rice", category: "Main", price: 280, cost: 43.92, par: 10 },
];

const THEME = {
  bg: "#0b0b0b",
  panel: "#131313",
  panelSoft: "#171717",
  border: "rgba(255,255,255,0.08)",
  text: "#f5f5f5",
  muted: "#b7b2a4",
  accent: "#f97316",
  accentSoft: "rgba(249,115,22,0.16)",
  khaki: "#c8ba97",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
};

function createInitialRows() {
  return DISH_CATALOG.map((item) => ({
    ...item,
    openingStock: 0,
    soldQty: 0,
    producedQty: 0,
  }));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function clampNumber(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function getCurrentStock(row) {
  return Math.max((row.openingStock || 0) + (row.producedQty || 0) - (row.soldQty || 0), 0);
}

function getToProduce(row) {
  return Math.max((row.par || 0) - getCurrentStock(row), 0);
}

function getPrepStatus(row) {
  const currentStock = getCurrentStock(row);
  const toProduce = getToProduce(row);

  if (currentStock <= 0) return "OUT";
  if (toProduce > 0) return "SEND TO KITCHEN";
  return "READY";
}

function getDishRevenue(row) {
  return (row.soldQty || 0) * (row.price || 0);
}

function getDishCost(row) {
  return (row.soldQty || 0) * (row.cost || 0);
}

function getDishProfit(row) {
  return getDishRevenue(row) - getDishCost(row);
}

function getMenuEngineeringLabel(row, averageSold, averageProfit) {
  const sold = row.soldQty || 0;
  const profit = getDishProfit(row);

  const highPopularity = sold >= averageSold;
  const highProfit = profit >= averageProfit;

  if (highPopularity && highProfit) return "Star";
  if (highPopularity && !highProfit) return "Plowhorse";
  if (!highPopularity && highProfit) return "Puzzle";
  return "Dog";
}

function getMenuEngineeringTone(label) {
  if (label === "Star") return { bg: "rgba(34,197,94,0.15)", color: THEME.green };
  if (label === "Plowhorse") return { bg: "rgba(234,179,8,0.15)", color: THEME.yellow };
  if (label === "Puzzle") return { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" };
  return { bg: "rgba(239,68,68,0.15)", color: THEME.red };
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            color: THEME.text,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            style={{
              margin: "6px 0 0",
              color: THEME.muted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function SummaryCard({ label, value, subValue, accent }) {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${accent ? THEME.accentSoft : THEME.border}`,
        borderRadius: 18,
        padding: 16,
        minHeight: 104,
      }}
    >
      <div style={{ color: THEME.muted, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          color: accent ? THEME.accent : THEME.text,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {subValue ? (
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 8 }}>{subValue}</div>
      ) : null}
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", min = 0, step = "any", placeholder }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ color: THEME.muted, fontSize: 12 }}>{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        style={{
          width: "100%",
          borderRadius: 12,
          border: `1px solid ${THEME.border}`,
          background: "#101010",
          color: THEME.text,
          padding: "12px 14px",
          outline: "none",
          fontSize: 14,
        }}
      />
    </label>
  );
}

function MobileDishCard({ row, onRowChange, averageSold, averageProfit }) {
  const currentStock = getCurrentStock(row);
  const toProduce = getToProduce(row);
  const prepStatus = getPrepStatus(row);
  const revenue = getDishRevenue(row);
  const cost = getDishCost(row);
  const profit = getDishProfit(row);
  const label = getMenuEngineeringLabel(row, averageSold, averageProfit);
  const tone = getMenuEngineeringTone(label);

  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: THEME.khakि, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {row.category}
          </div>
          <div style={{ color: THEME.text, fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{row.name}</div>
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            background: tone.bg,
            color: tone.color,
            borderRadius: 999,
            padding: "7px 10px",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <InputField
          label="Sold Qty"
          type="number"
          min="0"
          step="1"
          value={row.soldQty}
          onChange={(event) => onRowChange("soldQty", clampNumber(event.target.value))}
        />
        <InputField
          label="Produced Qty"
          type="number"
          min="0"
          step="1"
          value={row.producedQty}
          onChange={(event) => onRowChange("producedQty", clampNumber(event.target.value))}
        />
        <InputField
          label="Opening Stock"
          type="number"
          min="0"
          step="1"
          value={row.openingStock}
          onChange={(event) => onRowChange("openingStock", clampNumber(event.target.value))}
        />
        <InputField
          label="Par Level"
          type="number"
          min="0"
          step="1"
          value={row.par}
          onChange={(event) => onRowChange("par", clampNumber(event.target.value))}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div style={{ background: THEME.panelSoft, borderRadius: 14, padding: 12 }}>
          <div style={{ color: THEME.muted, fontSize: 11 }}>Current Stock</div>
          <div style={{ color: THEME.text, fontSize: 18, fontWeight: 700 }}>{currentStock}</div>
        </div>
        <div style={{ background: THEME.panelSoft, borderRadius: 14, padding: 12 }}>
          <div style={{ color: THEME.muted, fontSize: 11 }}>To Produce</div>
          <div style={{ color: THEME.accent, fontSize: 18, fontWeight: 700 }}>{toProduce}</div>
        </div>
        <div style={{ background: THEME.panelSoft, borderRadius: 14, padding: 12 }}>
          <div style={{ color: THEME.muted, fontSize: 11 }}>Revenue</div>
          <div style={{ color: THEME.text, fontSize: 16, fontWeight: 700 }}>{formatCurrency(revenue)}</div>
        </div>
        <div style={{ background: THEME.panelSoft, borderRadius: 14, padding: 12 }}>
          <div style={{ color: THEME.muted, fontSize: 11 }}>Gross Profit</div>
          <div style={{ color: profit >= 0 ? THEME.green : THEME.red, fontSize: 16, fontWeight: 700 }}>
            {formatCurrency(profit)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ color: THEME.muted, fontSize: 12 }}>
          Price {formatCurrency(row.price)} | Recipe Cost {formatCurrency(row.cost)} | Food Cost {formatPercent(row.cost / row.price)}
        </div>
        <div
          style={{
            borderRadius: 999,
            padding: "7px 10px",
            fontSize: 11,
            fontWeight: 700,
            background:
              prepStatus === "READY"
                ? "rgba(34,197,94,0.14)"
                : prepStatus === "OUT"
                ? "rgba(239,68,68,0.14)"
                : "rgba(249,115,22,0.14)",
            color:
              prepStatus === "READY"
                ? THEME.green
                : prepStatus === "OUT"
                ? THEME.red
                : THEME.accent,
          }}
        >
          {prepStatus}
        </div>
      </div>

      <div style={{ color: THEME.muted, fontSize: 12 }}>
        Cost {formatCurrency(cost)} | Margin {revenue > 0 ? formatPercent(profit / revenue) : "0.0%"}
      </div>
    </div>
  );
}

export default function ControlFinal() {
  const [rows, setRows] = useState(createInitialRows);
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [covers, setCovers] = useState(0);
  const [drinkRevenue, setDrinkRevenue] = useState(0);
  const [avgTicketTime, setAvgTicketTime] = useState(0);
  const [secondRoundRate, setSecondRoundRate] = useState(0);
  const [complaints, setComplaints] = useState(0);
  const [managerNotes, setManagerNotes] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(DISH_CATALOG.map((item) => item.category)))],
    []
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchCategory = categoryFilter === "All" || row.category === categoryFilter;
      const matchSearch =
        !search.trim() ||
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.category.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [rows, categoryFilter, search]);

  const totalFoodRevenue = useMemo(
    () => rows.reduce((sum, row) => sum + getDishRevenue(row), 0),
    [rows]
  );

  const totalFoodCost = useMemo(
    () => rows.reduce((sum, row) => sum + getDishCost(row), 0),
    [rows]
  );

  const totalRevenue = totalFoodRevenue + Number(drinkRevenue || 0);
  const totalProfit = totalRevenue - totalFoodCost;
  const totalSold = useMemo(() => rows.reduce((sum, row) => sum + (row.soldQty || 0), 0), [rows]);
  const totalToProduce = useMemo(() => rows.reduce((sum, row) => sum + getToProduce(row), 0), [rows]);
  const lowStockCount = useMemo(() => rows.filter((row) => getToProduce(row) > 0).length, [rows]);
  const foodCostPct = totalRevenue > 0 ? totalFoodCost / totalRevenue : 0;
  const foodOnlyCostPct = totalFoodRevenue > 0 ? totalFoodCost / totalFoodRevenue : 0;
  const revenuePerCover = covers > 0 ? totalRevenue / covers : 0;
  const drinksPerCover = covers > 0 ? Number(drinkRevenue || 0) / covers : 0;
  const grossMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;

  const averageSold = useMemo(() => {
    const active = rows.filter((row) => row.soldQty > 0);
    if (!active.length) return 1;
    return active.reduce((sum, row) => sum + row.soldQty, 0) / active.length;
  }, [rows]);

  const averageProfit = useMemo(() => {
    const active = rows.filter((row) => row.soldQty > 0);
    if (!active.length) return 1;
    return active.reduce((sum, row) => sum + getDishProfit(row), 0) / active.length;
  }, [rows]);

  const enrichedRows = useMemo(() => {
    return rows.map((row) => ({
      ...row,
      currentStock: getCurrentStock(row),
      toProduce: getToProduce(row),
      status: getPrepStatus(row),
      revenue: getDishRevenue(row),
      cogs: getDishCost(row),
      profit: getDishProfit(row),
      menuClass: getMenuEngineeringLabel(row, averageSold, averageProfit),
    }));
  }, [rows, averageProfit, averageSold]);

  const sortedByRevenue = useMemo(
    () => [...enrichedRows].sort((a, b) => b.revenue - a.revenue),
    [enrichedRows]
  );

  const aiInsights = useMemo(() => {
    const insights = [];

    const topSeller = [...enrichedRows].sort((a, b) => b.soldQty - a.soldQty)[0];
    const strongestProfit = [...enrichedRows].sort((a, b) => b.profit - a.profit)[0];
    const weakestProfit = [...enrichedRows].sort((a, b) => a.profit - b.profit)[0];
    const dogs = enrichedRows.filter((row) => row.menuClass === "Dog" && row.soldQty > 0);
    const puzzles = enrichedRows.filter((row) => row.menuClass === "Puzzle");
    const urgentPrep = enrichedRows
      .filter((row) => row.toProduce > 0)
      .sort((a, b) => b.toProduce - a.toProduce)
      .slice(0, 3);

    if (topSeller && topSeller.soldQty > 0) {
      insights.push(
        `${topSeller.name} is leading volume with ${topSeller.soldQty} sold. Keep visibility high and protect service speed on this item.`
      );
    }

    if (strongestProfit && strongestProfit.profit > 0) {
      insights.push(
        `${strongestProfit.name} is generating the strongest gross profit at ${formatCurrency(
          strongestProfit.profit
        )}. This is a priority item for upselling and premium positioning.`
      );
    }

    if (foodOnlyCostPct > 0.35) {
      insights.push(
        `Food cost is elevated at ${formatPercent(
          foodOnlyCostPct
        )} of food revenue. Review portion control and price discipline on high-cost mains immediately.`
      );
    } else if (foodOnlyCostPct > 0 && foodOnlyCostPct <= 0.3) {
      insights.push(
        `Food cost is controlled at ${formatPercent(
          foodOnlyCostPct
        )}. Current pricing and recipe structure are supporting a healthy operating position.`
      );
    }

    if (avgTicketTime > 20) {
      insights.push(
        `Average ticket time is ${formatNumber(
          avgTicketTime
        )} minutes. Service flow should be reviewed before the next rush period.`
      );
    }

    if (secondRoundRate > 0 && secondRoundRate < 0.45) {
      insights.push(
        `Second-round performance is ${formatPercent(
          secondRoundRate
        )}. Improve drink follow-up and dessert prompts to increase table value.`
      );
    }

    if (complaints > 2) {
      insights.push(
        `${complaints} guest complaints recorded. Manager follow-up is recommended before day close.`
      );
    }

    if (urgentPrep.length) {
      insights.push(
        `Production gap detected on ${urgentPrep
          .map((row) => `${row.name} (${row.toProduce})`)
          .join(", ")}. Kitchen prep should be aligned with par before peak service.`
      );
    }

    if (dogs.length) {
      insights.push(
        `${dogs.length} dishes are currently classed as Dog. Review menu placement, price fit, or portion logic before carrying them forward unchanged.`
      );
    }

    if (puzzles.length) {
      insights.push(
        `${puzzles.length} dishes are classed as Puzzle. These are profitable but under-ordered, so they should be re-positioned by staff recommendation or menu placement.`
      );
    }

    if (weakestProfit && weakestProfit.soldQty > 0) {
      insights.push(
        `${weakestProfit.name} is the weakest current return. Watch discounting, cost leakage, or low-margin volume on this item.`
      );
    }

    return insights.slice(0, 7);
  }, [
    enrichedRows,
    avgTicketTime,
    complaints,
    foodOnlyCostPct,
    secondRoundRate,
  ]);

  const ownerStatus = useMemo(() => {
    const score =
      (avgTicketTime <= 15 ? 25 : avgTicketTime <= 20 ? 15 : 0) +
      (secondRoundRate >= 0.6 ? 25 : secondRoundRate >= 0.45 ? 15 : 0) +
      (foodOnlyCostPct <= 0.03 ? 25 : foodOnlyCostPct <= 0.05 ? 15 : foodOnlyCostPct <= 0.35 ? 20 : 0) +
      (complaints === 0 ? 25 : complaints <= 2 ? 15 : 0);

    if (score >= 80) return { score, status: "GOOD", color: THEME.green };
    if (score >= 60) return { score, status: "WARNING", color: THEME.yellow };
    return { score, status: "BAD", color: THEME.red };
  }, [avgTicketTime, secondRoundRate, foodOnlyCostPct, complaints]);

  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  }

  function resetDay() {
    setRows(createInitialRows());
    setCovers(0);
    setDrinkRevenue(0);
    setAvgTicketTime(0);
    setSecondRoundRate(0);
    setComplaints(0);
    setManagerNotes("");
    setSaveMessage("");
  }

  async function handleSaveDay() {
    setSaving(true);
    setSaveMessage("");

    try {
      const payload = {
        date: businessDate,
        dishes: JSON.stringify({
          meta: {
            covers: Number(covers || 0),
            drinkRevenue: Number(drinkRevenue || 0),
            avgTicketTime: Number(avgTicketTime || 0),
            secondRoundRate: Number(secondRoundRate || 0),
            complaints: Number(complaints || 0),
            managerNotes,
            ownerStatus,
          },
          rows: enrichedRows.map((row) => ({
            name: row.name,
            category: row.category,
            price: row.price,
            cost: row.cost,
            par: row.par,
            openingStock: row.openingStock,
            soldQty: row.soldQty,
            producedQty: row.producedQty,
            currentStock: row.currentStock,
            toProduce: row.toProduce,
            status: row.status,
            revenue: Number(row.revenue.toFixed(2)),
            cogs: Number(row.cogs.toFixed(2)),
            profit: Number(row.profit.toFixed(2)),
            menuClass: row.menuClass,
          })),
          insights: aiInsights,
        }),
        revenue: Number(totalRevenue.toFixed(2)),
        cost: Number(totalFoodCost.toFixed(2)),
        profit: Number(totalProfit.toFixed(2)),
      };

      const response = await fetch("/api/save-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save report.");
      }

      setSaveMessage("Day saved successfully.");
    } catch (error) {
      setSaveMessage(error.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (saveMessage) {
        setSaveMessage("");
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [saveMessage]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.bg,
        color: THEME.text,
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(14px)",
          background: "rgba(11,11,11,0.88)",
          borderBottom: `1px solid ${THEME.border}`,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1480,
            margin: "0 auto",
            padding: "16px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  color: THEME.accent,
                  fontWeight: 900,
                  fontSize: 24,
                  letterSpacing: "-0.04em",
                }}
              >
                CC
              </div>
              <div
                style={{
                  color: THEME.text,
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "-0.03em",
                }}
              >
                Churchill Karon
              </div>
            </div>
            <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
              Daily Control Center | Mobile-Optimized V6
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={resetDay}
              style={{
                border: `1px solid ${THEME.border}`,
                background: THEME.panel,
                color: THEME.text,
                padding: "11px 14px",
                borderRadius: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset Day
            </button>
            <button
              onClick={handleSaveDay}
              disabled={saving}
              style={{
                border: "none",
                background: THEME.accent,
                color: "#ffffff",
                padding: "11px 16px",
                borderRadius: 12,
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Day"}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 1480,
          margin: "0 auto",
          padding: "18px 16px 40px",
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <SummaryCard
            label="Total Revenue"
            value={formatCurrency(totalRevenue)}
            subValue={`Food ${formatCurrency(totalFoodRevenue)} | Drinks ${formatCurrency(drinkRevenue)}`}
            accent
          />
          <SummaryCard
            label="Food Cost"
            value={formatCurrency(totalFoodCost)}
            subValue={`Food Cost ${formatPercent(foodOnlyCostPct)}`}
          />
          <SummaryCard
            label="Gross Profit"
            value={formatCurrency(totalProfit)}
            subValue={`Margin ${formatPercent(grossMargin)}`}
          />
          <SummaryCard
            label="Dishes Sold"
            value={formatNumber(totalSold)}
            subValue={`${lowStockCount} dishes below par`}
          />
          <SummaryCard
            label="Units To Produce"
            value={formatNumber(totalToProduce)}
            subValue={`Revenue / Cover ${formatCurrency(revenuePerCover)}`}
          />
          <SummaryCard
            label="Owner Status"
            value={ownerStatus.status}
            subValue={`Score ${ownerStatus.score}`}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.9fr)",
            gap: 18,
          }}
        >
          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Shift Inputs"
              subtitle="Control the day from one page. Mobile cards on small screens, full table on larger screens."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <InputField
                label="Business Date"
                type="date"
                value={businessDate}
                onChange={(event) => setBusinessDate(event.target.value)}
              />
              <InputField
                label="Covers"
                type="number"
                min="0"
                step="1"
                value={covers}
                onChange={(event) => setCovers(clampNumber(event.target.value))}
              />
              <InputField
                label="Drink Revenue"
                type="number"
                min="0"
                step="0.01"
                value={drinkRevenue}
                onChange={(event) => setDrinkRevenue(clampNumber(event.target.value))}
              />
              <InputField
                label="Avg Ticket Time (min)"
                type="number"
                min="0"
                step="0.1"
                value={avgTicketTime}
                onChange={(event) => setAvgTicketTime(clampNumber(event.target.value))}
              />
              <InputField
                label="Second Round Rate"
                type="number"
                min="0"
                step="0.01"
                value={secondRoundRate}
                onChange={(event) => setSecondRoundRate(clampNumber(event.target.value))}
                placeholder="0.00 to 1.00"
              />
              <InputField
                label="Complaints"
                type="number"
                min="0"
                step="1"
                value={complaints}
                onChange={(event) => setComplaints(clampNumber(event.target.value))}
              />
            </div>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ color: THEME.muted, fontSize: 12 }}>Manager Notes</span>
              <textarea
                value={managerNotes}
                onChange={(event) => setManagerNotes(event.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: `1px solid ${THEME.border}`,
                  background: "#101010",
                  color: THEME.text,
                  padding: "14px 14px",
                  outline: "none",
                  fontSize: 14,
                  resize: "vertical",
                }}
                placeholder="Write operational notes, service observations, or follow-up actions."
              />
            </label>
          </div>

          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Owner Control"
              subtitle="High-level metrics for cost discipline, service speed, and revenue quality."
            />

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ background: THEME.panelSoft, borderRadius: 16, padding: 14 }}>
                <div style={{ color: THEME.muted, fontSize: 12 }}>Food Revenue</div>
                <div style={{ color: THEME.text, fontSize: 20, fontWeight: 800 }}>{formatCurrency(totalFoodRevenue)}</div>
              </div>
              <div style={{ background: THEME.panelSoft, borderRadius: 16, padding: 14 }}>
                <div style={{ color: THEME.muted, fontSize: 12 }}>Revenue / Cover</div>
                <div style={{ color: THEME.text, fontSize: 20, fontWeight: 800 }}>{formatCurrency(revenuePerCover)}</div>
              </div>
              <div style={{ background: THEME.panelSoft, borderRadius: 16, padding: 14 }}>
                <div style={{ color: THEME.muted, fontSize: 12 }}>Drinks / Cover</div>
                <div style={{ color: THEME.text, fontSize: 20, fontWeight: 800 }}>{formatCurrency(drinksPerCover)}</div>
              </div>
              <div style={{ background: THEME.panelSoft, borderRadius: 16, padding: 14 }}>
                <div style={{ color: THEME.muted, fontSize: 12 }}>Food Cost %</div>
                <div style={{ color: ownerStatus.color, fontSize: 20, fontWeight: 800 }}>{formatPercent(foodOnlyCostPct)}</div>
              </div>
            </div>

            {saveMessage ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: saveMessage.toLowerCase().includes("success")
                    ? "rgba(34,197,94,0.14)"
                    : "rgba(239,68,68,0.14)",
                  color: saveMessage.toLowerCase().includes("success") ? THEME.green : THEME.red,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {saveMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 22,
            padding: 18,
            minWidth: 0,
          }}
        >
          <SectionTitle
            title="Service Control Table"
            subtitle="Full logic preserved: quantity input, production planning, price and cost, revenue, gross profit, and menu engineering."
            right={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search dish or category"
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${THEME.border}`,
                    background: "#101010",
                    color: THEME.text,
                    padding: "10px 12px",
                    minWidth: 180,
                    outline: "none",
                  }}
                />
              </div>
            }
          />

          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 6,
              marginBottom: 16,
            }}
          >
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                style={{
                  border: categoryFilter === category ? "none" : `1px solid ${THEME.border}`,
                  background: categoryFilter === category ? THEME.accent : THEME.panelSoft,
                  color: "#fff",
                  borderRadius: 999,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="desktop-table-wrap" style={{ overflowX: "auto", display: "none" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 1180,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Category",
                    "Dish",
                    "Sold",
                    "Produced",
                    "Open",
                    "Current",
                    "Par",
                    "To Produce",
                    "Status",
                    "Price",
                    "Cost",
                    "Revenue",
                    "Gross Profit",
                    "Menu",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        textAlign: "left",
                        color: THEME.muted,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "12px 10px",
                        borderBottom: `1px solid ${THEME.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const index = rows.findIndex((item) => item.name === row.name);
                  const currentStock = getCurrentStock(row);
                  const toProduce = getToProduce(row);
                  const status = getPrepStatus(row);
                  const revenue = getDishRevenue(row);
                  const profit = getDishProfit(row);
                  const label = getMenuEngineeringLabel(row, averageSold, averageProfit);
                  const tone = getMenuEngineeringTone(label);

                  return (
                    <tr key={row.name}>
                      <td style={cellStyle}>{row.category}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: THEME.text }}>{row.name}</td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.soldQty}
                          onChange={(event) => updateRow(index, "soldQty", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.producedQty}
                          onChange={(event) => updateRow(index, "producedQty", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.openingStock}
                          onChange={(event) => updateRow(index, "openingStock", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={cellStyle}>{currentStock}</td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.par}
                          onChange={(event) => updateRow(index, "par", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={cellStyle}>{toProduce}</td>
                      <td style={cellStyle}>{status}</td>
                      <td style={cellStyle}>{formatCurrency(row.price)}</td>
                      <td style={cellStyle}>{formatCurrency(row.cost)}</td>
                      <td style={cellStyle}>{formatCurrency(revenue)}</td>
                      <td style={{ ...cellStyle, color: profit >= 0 ? THEME.green : THEME.red }}>
                        {formatCurrency(profit)}
                      </td>
                      <td style={cellStyle}>
                        <span
                          style={{
                            background: tone.bg,
                            color: tone.color,
                            borderRadius: 999,
                            padding: "6px 9px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards" style={{ display: "grid", gap: 14 }}>
            {filteredRows.map((row) => {
              const index = rows.findIndex((item) => item.name === row.name);
              return (
                <MobileDishCard
                  key={row.name}
                  row={row}
                  averageSold={averageSold}
                  averageProfit={averageProfit}
                  onRowChange={(field, value) => updateRow(index, field, value)}
                />
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
            gap: 18,
          }}
        >
          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="AI Manager Insights"
              subtitle="Operational reading based on cost, speed, sales pattern, and menu performance."
            />

            <div style={{ display: "grid", gap: 12 }}>
              {aiInsights.length ? (
                aiInsights.map((insight, index) => (
                  <div
                    key={`${index}-${insight}`}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 16,
                      padding: 14,
                      color: THEME.text,
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {insight}
                  </div>
                ))
              ) : (
                <div
                  style={{
                    background: THEME.panelSoft,
                    borderRadius: 16,
                    padding: 14,
                    color: THEME.muted,
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  Enter sales and shift data to activate the AI manager insights.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 22,
              padding: 18,
              minWidth: 0,
            }}
          >
            <SectionTitle
              title="Menu Engineering"
              subtitle="Star, Plowhorse, Puzzle, and Dog classification based on actual daily volume and gross profit."
            />

            <div style={{ display: "grid", gap: 10 }}>
              {sortedByRevenue.slice(0, 10).map((row) => {
                const label = getMenuEngineeringLabel(row, averageSold, averageProfit);
                const tone = getMenuEngineeringTone(label);

                return (
                  <div
                    key={row.name}
                    style={{
                      background: THEME.panelSoft,
                      borderRadius: 16,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 14,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ color: THEME.text, fontSize: 15, fontWeight: 700 }}>{row.name}</div>
                      <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>
                        Sold {row.soldQty} | Revenue {formatCurrency(row.revenue)} | Gross Profit {formatCurrency(row.profit)}
                      </div>
                    </div>
                    <div
                      style={{
                        background: tone.bg,
                        color: tone.color,
                        borderRadius: 999,
                        padding: "7px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (min-width: 1100px) {
          .desktop-table-wrap {
            display: block !important;
          }
          .mobile-cards {
            display: none !important;
          }
        }

        @media (max-width: 1099px) {
          .desktop-table-wrap {
            display: none !important;
          }
          .mobile-cards {
            display: grid !important;
          }
        }

        @media (max-width: 980px) {
          div[style*="grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.9fr)"],
          div[style*="grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const cellStyle = {
  padding: "10px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  color: THEME.muted,
  fontSize: 13,
  verticalAlign: "middle",
};

const smallInputStyle = {
  width: 72,
  borderRadius: 10,
  border: `1px solid ${THEME.border}`,
  background: "#101010",
  color: THEME.text,
  padding: "8px 9px",
  outline: "none",
  fontSize: 13,
};