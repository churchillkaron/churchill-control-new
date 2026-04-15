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
  panelSoft2: "#101010",
  border: "rgba(255,255,255,0.08)",
  text: "#f5f5f5",
  muted: "#b7b2a4",
  accent: "#f97316",
  accentSoft: "rgba(249,115,22,0.14)",
  khaki: "#c8ba97",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  blue: "#60a5fa",
};

function createInitialRows() {
  return DISH_CATALOG.map((item) => ({
    ...item,
    openingStock: 0,
    soldQty: 0,
    producedQty: 0,
  }));
}

function clampNumber(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeRowsArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSavedRow(savedRow, baseRow) {
  return {
    ...baseRow,
    par: clampNumber(savedRow?.par ?? baseRow.par ?? 0),
    openingStock: clampNumber(savedRow?.openingStock ?? savedRow?.open ?? 0),
    soldQty: clampNumber(savedRow?.soldQty ?? savedRow?.sold ?? 0),
    producedQty: clampNumber(savedRow?.producedQty ?? savedRow?.produced ?? 0),
  };
}

function extractSavedState(report) {
  if (!report || !report.dishes) return null;

  let parsed;
  try {
    parsed = typeof report.dishes === "string" ? JSON.parse(report.dishes) : report.dishes;
  } catch {
    return null;
  }

  const meta = parsed?.meta || {};
  const savedRows = safeRowsArray(parsed?.rows);

  const baseRows = createInitialRows();
  const mergedRows = baseRows.map((baseRow) => {
    const matchedRow =
      savedRows.find((row) => safeString(row?.name).trim() === baseRow.name) || null;
    return normalizeSavedRow(matchedRow, baseRow);
  });

  return {
    businessDate: safeString(report.date, new Date().toISOString().slice(0, 10)),
    covers: clampNumber(meta.covers ?? 0),
    drinkRevenue: clampNumber(meta.drinkRevenue ?? 0),
    avgTicketTime: clampNumber(meta.avgTicketTime ?? 0),
    secondRoundRate: clampNumber(meta.secondRoundRate ?? 0),
    complaints: clampNumber(meta.complaints ?? 0),
    managerNotes: safeString(meta.managerNotes, ""),
    rows: mergedRows,
  };
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
  if (toProduce > 0) return "PREP";
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

  if (sold === 0) return "NO DATA";

  const highPopularity = sold >= averageSold;
  const highProfit = profit >= averageProfit;

  if (highPopularity && highProfit) return "Star";
  if (highPopularity && !highProfit) return "Plowhorse";
  if (!highPopularity && highProfit) return "Puzzle";
  return "Dog";
}

function getMenuTone(label) {
  if (label === "Star") return { bg: "rgba(34,197,94,0.14)", color: THEME.green };
  if (label === "Plowhorse") return { bg: "rgba(234,179,8,0.14)", color: THEME.yellow };
  if (label === "Puzzle") return { bg: "rgba(96,165,250,0.14)", color: THEME.blue };
  if (label === "Dog") return { bg: "rgba(239,68,68,0.14)", color: THEME.red };
  return { bg: "rgba(255,255,255,0.08)", color: THEME.muted };
}

function getStatusTone(status) {
  if (status === "READY") return { bg: "rgba(34,197,94,0.14)", color: THEME.green };
  if (status === "PREP") return { bg: "rgba(249,115,22,0.14)", color: THEME.accent };
  return { bg: "rgba(239,68,68,0.14)", color: THEME.red };
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
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
              lineHeight: 1.55,
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
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{subValue}</div>
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
          background: THEME.panelSoft2,
          color: THEME.text,
          padding: "12px 14px",
          outline: "none",
          fontSize: 14,
        }}
      />
    </label>
  );
}

function StatMiniCard({ label, value, valueColor }) {
  return (
    <div
      style={{
        background: THEME.panelSoft,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ color: THEME.muted, fontSize: 11 }}>{label}</div>
      <div
        style={{
          color: valueColor || THEME.text,
          fontSize: 17,
          fontWeight: 700,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DishCard({ row, onChange, averageSold, averageProfit }) {
  const currentStock = getCurrentStock(row);
  const toProduce = getToProduce(row);
  const prepStatus = getPrepStatus(row);
  const revenue = getDishRevenue(row);
  const cost = getDishCost(row);
  const profit = getDishProfit(row);
  const label = getMenuEngineeringLabel(row, averageSold, averageProfit);
  const labelTone = getMenuTone(label);
  const statusTone = getStatusTone(prepStatus);

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              color: THEME.khaki,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {row.category}
          </div>
          <div
            style={{
              color: THEME.text,
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.25,
              marginTop: 4,
            }}
          >
            {row.name}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            justifyItems: "end",
          }}
        >
          <span
            style={{
              background: labelTone.bg,
              color: labelTone.color,
              borderRadius: 999,
              padding: "7px 10px",
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          <span
            style={{
              background: statusTone.bg,
              color: statusTone.color,
              borderRadius: 999,
              padding: "7px 10px",
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {prepStatus}
          </span>
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
          onChange={(event) => onChange("soldQty", clampNumber(event.target.value))}
        />
        <InputField
          label="Produced Qty"
          type="number"
          min="0"
          step="1"
          value={row.producedQty}
          onChange={(event) => onChange("producedQty", clampNumber(event.target.value))}
        />
        <InputField
          label="Opening Stock"
          type="number"
          min="0"
          step="1"
          value={row.openingStock}
          onChange={(event) => onChange("openingStock", clampNumber(event.target.value))}
        />
        <InputField
          label="Par Level"
          type="number"
          min="0"
          step="1"
          value={row.par}
          onChange={(event) => onChange("par", clampNumber(event.target.value))}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <StatMiniCard label="Current Stock" value={formatNumber(currentStock)} />
        <StatMiniCard label="To Produce" value={formatNumber(toProduce)} valueColor={THEME.accent} />
        <StatMiniCard label="Revenue" value={formatCurrency(revenue)} />
        <StatMiniCard
          label="Gross Profit"
          value={formatCurrency(profit)}
          valueColor={profit >= 0 ? THEME.green : THEME.red}
        />
      </div>

      <div
        style={{
          background: THEME.panelSoft,
          borderRadius: 14,
          padding: 12,
          color: THEME.muted,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        Price {formatCurrency(row.price)} | Recipe Cost {formatCurrency(row.cost)} | Food Cost{" "}
        {row.price > 0 ? formatPercent(row.cost / row.price) : "0.0%"}
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
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(DISH_CATALOG.map((item) => item.category)))],
    []
  );

  useEffect(() => {
    if (initialLoadComplete) return;

    let cancelled = false;

    async function loadLatestSavedDay() {
      try {
        const response = await fetch("/api/history", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          setInitialLoadComplete(true);
          return;
        }

        const data = await response.json();
        if (!Array.isArray(data) || !data.length) {
          setInitialLoadComplete(true);
          return;
        }

        const latest = data[0];
        const restored = extractSavedState(latest);

        if (!restored || cancelled) {
          setInitialLoadComplete(true);
          return;
        }

        setRows(restored.rows);
        setBusinessDate(restored.businessDate);
        setCovers(restored.covers);
        setDrinkRevenue(restored.drinkRevenue);
        setAvgTicketTime(restored.avgTicketTime);
        setSecondRoundRate(restored.secondRoundRate);
        setComplaints(restored.complaints);
        setManagerNotes(restored.managerNotes);
      } catch (error) {
        console.error("Failed to load latest saved control day:", error);
      } finally {
        if (!cancelled) {
          setInitialLoadComplete(true);
        }
      }
    }

    loadLatestSavedDay();

    return () => {
      cancelled = true;
    };
  }, [initialLoadComplete]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const categoryMatch = categoryFilter === "All" || row.category === categoryFilter;
      const searchMatch =
        !search.trim() ||
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.category.toLowerCase().includes(search.toLowerCase());

      return categoryMatch && searchMatch;
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

  const foodCostPct = totalFoodRevenue > 0 ? totalFoodCost / totalFoodRevenue : 0;
  const grossMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;
  const revenuePerCover = covers > 0 ? totalRevenue / covers : 0;
  const drinksPerCover = covers > 0 ? Number(drinkRevenue || 0) / covers : 0;

  const hasOperationalData =
    totalRevenue > 0 ||
    totalSold > 0 ||
    Number(drinkRevenue || 0) > 0 ||
    Number(covers || 0) > 0 ||
    rows.some((row) => row.openingStock > 0 || row.producedQty > 0);

  const averageSold = useMemo(() => {
    const activeRows = rows.filter((row) => row.soldQty > 0);
    if (!activeRows.length) return 1;
    return activeRows.reduce((sum, row) => sum + row.soldQty, 0) / activeRows.length;
  }, [rows]);

  const averageProfit = useMemo(() => {
    const activeRows = rows.filter((row) => row.soldQty > 0);
    if (!activeRows.length) return 1;
    return activeRows.reduce((sum, row) => sum + getDishProfit(row), 0) / activeRows.length;
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
  }, [rows, averageSold, averageProfit]);

  const ownerStatus = useMemo(() => {
    let score = 0;
    const reasons = [];

    if (!hasOperationalData) {
      return {
        score: 0,
        status: "WAITING",
        reasons: ["Waiting for service data", "Enter sales or shift data to activate owner scoring"],
        color: THEME.muted,
      };
    }

    if (foodCostPct <= 0.3) {
      score += 30;
    } else if (foodCostPct <= 0.35) {
      score += 18;
      reasons.push("Food cost slightly above target");
    } else {
      reasons.push("Food cost above target");
    }

    if (grossMargin >= 0.55) {
      score += 25;
    } else if (grossMargin >= 0.4) {
      score += 15;
    } else {
      reasons.push("Margin below target");
    }

    if (secondRoundRate >= 0.6) {
      score += 15;
    } else if (secondRoundRate >= 0.45) {
      score += 8;
    } else if (secondRoundRate > 0) {
      reasons.push("Low second-round rate");
    }

    if (avgTicketTime > 0 && avgTicketTime <= 15) {
      score += 15;
    } else if (avgTicketTime > 0 && avgTicketTime <= 20) {
      score += 8;
    } else if (avgTicketTime > 20) {
      reasons.push("Ticket time above target");
    }

    if (complaints === 0) {
      score += 15;
    } else if (complaints <= 2) {
      score += 7;
      reasons.push("Minor guest complaints recorded");
    } else {
      reasons.push("Guest complaints require follow-up");
    }

    if (totalSold === 0) {
      reasons.push("No sales volume recorded yet");
    }

    if (reasons.length === 0) {
      reasons.push("Operating performance is on target");
      reasons.push("Current service metrics are stable");
    }

    if (score >= 75) {
      return {
        score,
        status: "GOOD",
        reasons,
        color: THEME.green,
      };
    }

    if (score >= 45) {
      return {
        score,
        status: "WARNING",
        reasons,
        color: THEME.yellow,
      };
    }

    return {
      score,
      status: "BAD",
      reasons,
      color: THEME.red,
    };
  }, [avgTicketTime, complaints, foodCostPct, grossMargin, hasOperationalData, secondRoundRate, totalSold]);

  const aiInsights = useMemo(() => {
    const insights = [];
    const urgentPrep = enrichedRows
      .filter((row) => row.toProduce > 0)
      .sort((a, b) => b.toProduce - a.toProduce)
      .slice(0, 4);

    const expensiveRows = enrichedRows
      .filter((row) => row.price > 0 && row.cost / row.price > 0.4)
      .sort((a, b) => b.cost / b.price - a.cost / a.price)
      .slice(0, 3);

    const topSeller = [...enrichedRows].sort((a, b) => b.soldQty - a.soldQty)[0];
    const topProfit = [...enrichedRows].sort((a, b) => b.profit - a.profit)[0];
    const weakProfit = [...enrichedRows]
      .filter((row) => row.soldQty > 0)
      .sort((a, b) => a.profit - b.profit)[0];

    if (!hasOperationalData) {
      insights.push("Waiting for service data. Enter sold quantities, production, or shift inputs to activate performance insights.");
      insights.push("Kitchen prep can be staged from the production gap view before peak hours begin.");
      return insights;
    }

    if (urgentPrep.length) {
      insights.push(
        `${urgentPrep.length} dishes are below par: ${urgentPrep
          .map((row) => `${row.name} (${row.toProduce})`)
          .join(", ")}. Prepare these before the next peak period.`
      );
    }

    if (topSeller && topSeller.soldQty > 0) {
      insights.push(
        `${topSeller.name} is currently leading volume with ${topSeller.soldQty} sold. Maintain visibility and service speed on this item.`
      );
    }

    if (topProfit && topProfit.profit > 0) {
      insights.push(
        `${topProfit.name} is the strongest gross-profit performer at ${formatCurrency(
          topProfit.profit
        )}. This item should stay central in upselling and menu focus.`
      );
    }

    if (weakProfit && weakProfit.profit >= 0) {
      insights.push(
        `${weakProfit.name} is the weakest active profit item at ${formatCurrency(
          weakProfit.profit
        )}. Review price discipline, portion size, or selling mix.`
      );
    }

    if (expensiveRows.length) {
      insights.push(
        `High-cost dishes need portion control attention: ${expensiveRows.map((row) => row.name).join(", ")}.`
      );
    }

    if (foodCostPct > 0.35) {
      insights.push(
        `Food cost is elevated at ${formatPercent(
          foodCostPct
        )}. Focus on recipe control and price integrity before close.`
      );
    }

    if (avgTicketTime > 20) {
      insights.push(
        `Average ticket time is ${formatNumber(
          avgTicketTime
        )} minutes. Review kitchen flow and station coordination.`
      );
    }

    if (secondRoundRate > 0 && secondRoundRate < 0.45) {
      insights.push(
        `Second-round rate is ${formatPercent(
          secondRoundRate
        )}. Improve follow-up selling for drinks and desserts.`
      );
    }

    return insights.slice(0, 6);
  }, [avgTicketTime, enrichedRows, foodCostPct, hasOperationalData, secondRoundRate]);

  const menuRows = useMemo(() => {
    return [...enrichedRows].sort((a, b) => b.revenue - a.revenue);
  }, [enrichedRows]);

  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  }

  function resetDay() {
    setRows(createInitialRows());
    setBusinessDate(new Date().toISOString().slice(0, 10));
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
      ownerStatus: {
        status: ownerStatus.status,
        score: ownerStatus.score,
        reasons: ownerStatus.reasons,
      },
    },

    // 🔥 THIS IS THE CRITICAL FIX
    rows: rows.map((row) => {
      const revenue = (row.soldQty || 0) * (row.price || 0);
      const cost = (row.soldQty || 0) * (row.cost || 0);
      const profit = revenue - cost;

      return {
        name: row.name,
        category: row.category,
        price: row.price,
        cost: row.cost,
        soldQty: Number(row.soldQty || 0), // 🔥 MUST exist
        revenue,
        costTotal: cost,
        profit,
      };
    }),

    insights: aiInsights,
  }),

  revenue: Number(totalRevenue.toFixed(2)),
  cost: Number(totalFoodCost.toFixed(2)),
  profit: Number(totalProfit.toFixed(2)),
};
    try {
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

      setSaveMessage(data?.mode === "updated" ? "Day updated successfully." : "Day saved successfully.");
    } catch (error) {
      setSaveMessage(error.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!saveMessage) return;

    const timer = setTimeout(() => {
      setSaveMessage("");
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
            padding: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={resetDay}
              style={{
                border: `1px solid ${THEME.border}`,
                background: THEME.panel,
                color: THEME.text,
                padding: "11px 14px",
                borderRadius: 12,
                fontWeight: 700,
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
            value={hasOperationalData ? formatCurrency(totalRevenue) : "Waiting"}
            subValue={
              hasOperationalData
                ? `Food ${formatCurrency(totalFoodRevenue)} | Drinks ${formatCurrency(drinkRevenue)}`
                : "Waiting for service data"
            }
            accent
          />
          <SummaryCard
            label="Food Cost"
            value={hasOperationalData ? formatCurrency(totalFoodCost) : formatCurrency(0)}
            subValue={`Food Cost ${formatPercent(foodCostPct)}`}
          />
          <SummaryCard
            label="Gross Profit"
            value={hasOperationalData ? formatCurrency(totalProfit) : formatCurrency(0)}
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
            gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.85fr)",
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
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
                rows={5}
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft2,
                  color: THEME.text,
                  padding: "14px",
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
              <StatMiniCard label="Food Revenue" value={formatCurrency(totalFoodRevenue)} />
              <StatMiniCard label="Revenue / Cover" value={formatCurrency(revenuePerCover)} />
              <StatMiniCard label="Drinks / Cover" value={formatCurrency(drinksPerCover)} />
              <StatMiniCard
                label="Food Cost %"
                value={formatPercent(foodCostPct)}
                valueColor={foodCostPct > 0.35 ? THEME.red : foodCostPct > 0.3 ? THEME.yellow : THEME.green}
              />
            </div>

            <div
              style={{
                marginTop: 14,
                background: THEME.panelSoft,
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ color: THEME.muted, fontSize: 12 }}>Current Owner Status</div>
              <div
                style={{
                  color: ownerStatus.color,
                  fontSize: 24,
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                {ownerStatus.status}
              </div>
              <div style={{ color: THEME.muted, fontSize: 12, marginTop: 6 }}>
                Score {ownerStatus.score}
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {ownerStatus.reasons.slice(0, 2).map((reason, index) => (
                  <div
                    key={`${index}-${reason}`}
                    style={{
                      background: THEME.panelSoft2,
                      borderRadius: 12,
                      padding: "10px 12px",
                      color: THEME.muted,
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {reason}
                  </div>
                ))}
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
                  fontWeight: 700,
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
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search dish or category"
                style={{
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft2,
                  color: THEME.text,
                  padding: "10px 12px",
                  minWidth: 200,
                  outline: "none",
                }}
              />
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
                  color: "#ffffff",
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
                minWidth: 1280,
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
                    <th key={heading} style={tableHeadStyle}>
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
                  const labelTone = getMenuTone(label);
                  const statusTone = getStatusTone(status);

                  return (
                    <tr key={row.name}>
                      <td style={tableCellStyle}>{row.category}</td>
                      <td style={tableCellStrongStyle}>{row.name}</td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.soldQty}
                          onChange={(event) => updateRow(index, "soldQty", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.producedQty}
                          onChange={(event) => updateRow(index, "producedQty", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.openingStock}
                          onChange={(event) => updateRow(index, "openingStock", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={tableCellStyle}>{formatNumber(currentStock)}</td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.par}
                          onChange={(event) => updateRow(index, "par", clampNumber(event.target.value))}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={tableCellStyle}>{formatNumber(toProduce)}</td>
                      <td style={tableCellStyle}>
                        <span
                          style={{
                            background: statusTone.bg,
                            color: statusTone.color,
                            borderRadius: 999,
                            padding: "6px 9px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {status}
                        </span>
                      </td>
                      <td style={tableCellStyle}>{formatCurrency(row.price)}</td>
                      <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                      <td style={tableCellStyle}>{formatCurrency(revenue)}</td>
                      <td
                        style={{
                          ...tableCellStyle,
                          color: profit >= 0 ? THEME.green : THEME.red,
                        }}
                      >
                        {formatCurrency(profit)}
                      </td>
                      <td style={tableCellStyle}>
                        <span
                          style={{
                            background: labelTone.bg,
                            color: labelTone.color,
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
                <DishCard
                  key={row.name}
                  row={row}
                  averageSold={averageSold}
                  averageProfit={averageProfit}
                  onChange={(field, value) => updateRow(index, field, value)}
                />
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
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
              {aiInsights.map((insight, index) => (
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
              ))}
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
              subtitle="Star, Plowhorse, Puzzle, Dog, and No Data classification based on actual daily volume and gross profit."
            />

            <div style={{ display: "grid", gap: 10 }}>
              {menuRows.slice(0, 8).map((row) => {
                const tone = getMenuTone(row.menuClass);

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
                      <div style={{ color: THEME.muted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                        Sold {formatNumber(row.soldQty)} | Revenue {formatCurrency(row.revenue)} | Gross Profit{" "}
                        {formatCurrency(row.profit)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: tone.bg,
                        color: tone.color,
                        borderRadius: 999,
                        padding: "8px 11px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {row.menuClass}
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
          div[style*="grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.85fr)"],
          div[style*="grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const tableHeadStyle = {
  textAlign: "left",
  color: THEME.muted,
  fontSize: 12,
  fontWeight: 600,
  padding: "12px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  whiteSpace: "nowrap",
};

const tableCellStyle = {
  padding: "10px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  color: THEME.muted,
  fontSize: 13,
  verticalAlign: "middle",
};

const tableCellStrongStyle = {
  ...tableCellStyle,
  color: THEME.text,
  fontWeight: 700,
};

const smallInputStyle = {
  width: 84,
  borderRadius: 10,
  border: `1px solid ${THEME.border}`,
  background: THEME.panelSoft2,
  color: THEME.text,
  padding: "8px 9px",
  outline: "none",
  fontSize: 13,
};