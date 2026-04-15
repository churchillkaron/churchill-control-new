"use client";

import { useMemo, useRef, useState } from "react";

const DISHES = [
  { name: "Beef Carpaccio", category: "Starter", price: 320, cost: 110.72, foodCostPct: 0.346 },
  { name: "Chili & Garlic Prawns", category: "Starter", price: 320, cost: 74.32, foodCostPct: 0.23225 },
  { name: "Signature Bruschetta", category: "Starter", price: 280, cost: 62.38, foodCostPct: 0.22278571428571428 },
  { name: "Seared Scallops", category: "Starter", price: 520, cost: 175.72, foodCostPct: 0.33792307692307694 },
  { name: "Mango & Tomato Salad", category: "Light", price: 220, cost: 16.97, foodCostPct: 0.07713636363636363 },

  { name: "Churchill Beef Short Ribs", category: "Main", price: 890, cost: 518.36, foodCostPct: 0.5824269662921349 },
  { name: "Ribeye Steak", category: "Main", price: 890, cost: 206.36, foodCostPct: 0.23186516853932582 },
  { name: "Beef Tenderloin", category: "Main", price: 920, cost: 265.69, foodCostPct: 0.28879347826086965 },
  { name: "Pork Tenderloin", category: "Main", price: 460, cost: 76.54, foodCostPct: 0.1663913043478261 },
  { name: "Salmon", category: "Main", price: 690, cost: 172.6, foodCostPct: 0.2501449275362319 },
  { name: "Churchill Sambal Half Chicken", category: "Main", price: 590, cost: 133.87, foodCostPct: 0.22689830508474576 },
  { name: "Veal Stew", category: "Main", price: 850, cost: 254.74, foodCostPct: 0.2996941176470588 },

  { name: "Potato Gratin", category: "Side", price: 120, cost: 30.34, foodCostPct: 0.25283333333333335 },
  { name: "Crispy Potato Wedges", category: "Side", price: 100, cost: 18.34, foodCostPct: 0.1834 },
  { name: "Cauliflower Puree", category: "Side", price: 120, cost: 27.44, foodCostPct: 0.22866666666666668 },

  { name: "Tom Yum Goong", category: "Soup", price: 180, cost: 94.4, foodCostPct: 0.5244444444444445 },
  { name: "Tom Kha Gai", category: "Soup", price: 170, cost: 70.1, foodCostPct: 0.4123529411764706 },

  { name: "Pad Thai", category: "Main", price: 160, cost: 56.55, foodCostPct: 0.3534375 },
  { name: "Pad Ka Prow", category: "Main", price: 150, cost: 36.91, foodCostPct: 0.24606666666666666 },
  { name: "Chicken Cashew Nuts", category: "Main", price: 180, cost: 68.04, foodCostPct: 0.37800000000000006 },
  { name: "Beef with Oyster Sauce", category: "Main", price: 220, cost: 160.53, foodCostPct: 0.7296818181818181 },
  { name: "Massaman Curry", category: "Main", price: 180, cost: 90.96, foodCostPct: 0.5053333333333333 },
  { name: "Green Curry", category: "Main", price: 170, cost: 80.77, foodCostPct: 0.47511764705882353 },
  { name: "Panang Curry", category: "Main", price: 175, cost: 71.9, foodCostPct: 0.41085714285714287 },
  { name: "Pineapple Fried Rice", category: "Main", price: 160, cost: 54.36, foodCostPct: 0.33975 },
];

function formatMoney(value) {
  return Number(value || 0).toFixed(0);
}

function SummaryBarsChart({ revenue, cost, profit }) {
  const values = [
    { label: "Revenue", value: revenue },
    { label: "Cost", value: cost },
    { label: "Profit", value: profit < 0 ? 0 : profit },
  ];

  const max = Math.max(...values.map((v) => v.value), 1);
  const chartHeight = 140;
  const barWidth = 70;
  const gap = 35;

  return (
    <svg
      width="100%"
      viewBox="0 0 320 190"
      style={{ display: "block", marginTop: 10, border: "1px solid #ddd" }}
    >
      <line x1="30" y1="150" x2="300" y2="150" stroke="#222" strokeWidth="1" />
      <line x1="30" y1="10" x2="30" y2="150" stroke="#222" strokeWidth="1" />

      {values.map((item, index) => {
        const x = 55 + index * (barWidth + gap);
        const height = (item.value / max) * chartHeight;
        const y = 150 - height;

        return (
          <g key={item.label}>
            <rect x={x} y={y} width={barWidth} height={height} fill="#444" />
            <text x={x + barWidth / 2} y={165} textAnchor="middle" fontSize="11">
              {item.label}
            </text>
            <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="10">
              {formatMoney(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TopDishesChart({ dishes }) {
  const max = Math.max(...dishes.map((d) => d.qty), 1);
  const startX = 110;
  const maxWidth = 170;

  return (
    <svg
      width="100%"
      viewBox={`0 0 360 ${Math.max(120, dishes.length * 28 + 20)}`}
      style={{ display: "block", marginTop: 10, border: "1px solid #ddd" }}
    >
      {dishes.map((dish, index) => {
        const y = 24 + index * 28;
        const width = (dish.qty / max) * maxWidth;

        return (
          <g key={dish.name}>
            <text x="10" y={y + 10} fontSize="11">
              {dish.name.length > 16 ? `${dish.name.slice(0, 16)}...` : dish.name}
            </text>
            <rect x={startX} y={y} width={width} height="14" fill="#666" />
            <text x={startX + width + 8} y={y + 11} fontSize="10">
              {dish.qty}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ControlFinal() {
  const [rows, setRows] = useState([{ dish: "", qty: 1, price: 0, cost: 0 }]);
  const [search, setSearch] = useState("");
  const inputRefs = useRef([]);

  const filteredDishes = useMemo(() => {
    return DISHES.filter((dish) =>
      dish.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  const handleDishChange = (index, value) => {
    const selected = DISHES.find((dish) => dish.name === value);

    const updated = [...rows];
    updated[index] = {
      ...updated[index],
      dish: value,
      price: selected ? selected.price : 0,
      cost: selected ? selected.cost : 0,
    };
    setRows(updated);
  };

  const handleQtyChange = (index, value) => {
    const parsedQty = Math.max(0, Number(value) || 0);
    const updated = [...rows];
    updated[index].qty = parsedQty;
    setRows(updated);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { dish: "", qty: 1, price: 0, cost: 0 }]);
    setTimeout(() => {
      inputRefs.current[rows.length]?.focus();
    }, 50);
  };

  const removeRow = (index) => {
    if (rows.length === 1) {
      setRows([{ dish: "", qty: 1, price: 0, cost: 0 }]);
      return;
    }

    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);

    setTimeout(() => {
      const nextIndex = index > 0 ? index - 1 : 0;
      inputRefs.current[nextIndex]?.focus();
    }, 50);
  };

  const handleKeyDown = (e, index, field) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (field === "dish") {
        setTimeout(() => {
          const qtyInput = document.getElementById(`qty-${index}`);
          if (qtyInput) qtyInput.focus();
        }, 0);
        return;
      }

      if (field === "qty") {
        if (index === rows.length - 1) {
          addRow();
        } else {
          inputRefs.current[index + 1]?.focus();
        }
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index < rows.length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }

    if (
      e.key === "Backspace" &&
      field === "dish" &&
      rows[index].dish === "" &&
      rows.length > 1
    ) {
      e.preventDefault();
      removeRow(index);
    }
  };

  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let totalQty = 0;

    rows.forEach((row) => {
      revenue += Number(row.price || 0) * Number(row.qty || 0);
      cost += Number(row.cost || 0) * Number(row.qty || 0);
      totalQty += Number(row.qty || 0);
    });

    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      dishesSold: totalQty,
      avgSellPrice: totalQty > 0 ? revenue / totalQty : 0,
    };
  }, [rows]);

  const analytics = useMemo(() => {
    const byDish = {};
    const byCategory = {};

    rows.forEach((row) => {
      if (!row.dish || !row.qty) return;

      const dishInfo = DISHES.find((dish) => dish.name === row.dish);
      const category = dishInfo ? dishInfo.category : "Unknown";
      const qty = Number(row.qty || 0);
      const revenue = Number(row.price || 0) * qty;
      const cost = Number(row.cost || 0) * qty;
      const profit = revenue - cost;

      if (!byDish[row.dish]) {
        byDish[row.dish] = {
          name: row.dish,
          category,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
      }

      byDish[row.dish].qty += qty;
      byDish[row.dish].revenue += revenue;
      byDish[row.dish].cost += cost;
      byDish[row.dish].profit += profit;

      if (!byCategory[category]) {
        byCategory[category] = {
          category,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
      }

      byCategory[category].qty += qty;
      byCategory[category].revenue += revenue;
      byCategory[category].cost += cost;
      byCategory[category].profit += profit;
    });

    const dishList = Object.values(byDish).sort((a, b) => b.qty - a.qty);
    const categoryList = Object.values(byCategory).sort((a, b) => b.revenue - a.revenue);
    const topDish = dishList[0] || null;
    const mostProfitableDish = [...dishList].sort((a, b) => b.profit - a.profit)[0] || null;
    const worstFoodCostDish = [...dishList]
      .map((item) => ({
        ...item,
        foodCostPct: item.revenue > 0 ? (item.cost / item.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.foodCostPct - a.foodCostPct)[0] || null;

    return {
      dishList,
      categoryList,
      topDish,
      mostProfitableDish,
      worstFoodCostDish,
      topFive: dishList.slice(0, 5),
    };
  }, [rows]);

  const saveDay = async () => {
    const cleanedRows = rows.filter((row) => row.dish && row.qty > 0);

    await fetch("/api/save-day", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: new Date().toISOString(),
        dishes: cleanedRows,
        revenue: totals.revenue,
        cost: totals.cost,
        profit: totals.profit,
      }),
    });

    alert("Saved!");
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1 style={{ marginBottom: 20 }}>Churchill Control Panel</h1>

      <input
        placeholder="Search dish..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          marginBottom: 10,
          padding: 8,
          width: "100%",
        }}
      />

      <table width="100%" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Dish</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ paddingBottom: 8 }}>
                <select
                  ref={(el) => (inputRefs.current[i] = el)}
                  value={row.dish}
                  onChange={(e) => handleDishChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, i, "dish")}
                  style={{ width: "100%" }}
                >
                  <option value="">Select dish</option>
                  {filteredDishes.map((dish) => (
                    <option key={dish.name} value={dish.name}>
                      {dish.name} ({dish.category})
                    </option>
                  ))}
                </select>
              </td>

              <td align="center">
                <input
                  id={`qty-${i}`}
                  type="number"
                  min="0"
                  value={row.qty}
                  onChange={(e) => handleQtyChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, i, "qty")}
                  style={{ width: 60 }}
                />
              </td>

              <td align="center">{formatMoney(row.price)}</td>
              <td align="center">{formatMoney(row.cost)}</td>
              <td align="center">{formatMoney(row.price * row.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={addRow}
          style={{
            padding: "8px 14px",
            marginRight: 10,
            cursor: "pointer",
          }}
        >
          Add Row
        </button>

        <button
          onClick={() => removeRow(rows.length - 1)}
          style={{
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Remove Last Row
        </button>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Totals</h2>
        <p>Revenue: {formatMoney(totals.revenue)} THB</p>
        <p>Cost: {formatMoney(totals.cost)} THB</p>
        <p>Profit: {formatMoney(totals.profit)} THB</p>
        <p>Margin: {totals.margin.toFixed(1)}%</p>
        <p>Dishes Sold: {totals.dishesSold}</p>
        <p>Average Selling Price: {formatMoney(totals.avgSellPrice)} THB</p>
        <p>Top Dish: {analytics.topDish ? analytics.topDish.name : "-"}</p>
        <p>
          Best Profit Dish:{" "}
          {analytics.mostProfitableDish ? analytics.mostProfitableDish.name : "-"}
        </p>
        <p>
          Highest Food Cost Dish:{" "}
          {analytics.worstFoodCostDish ? analytics.worstFoodCostDish.name : "-"}
        </p>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Analytics</h2>
        <p>Revenue vs Cost vs Profit</p>
        <SummaryBarsChart
          revenue={totals.revenue}
          cost={totals.cost}
          profit={totals.profit}
        />

        <p style={{ marginTop: 20 }}>Top 5 Dishes by Quantity</p>
        <TopDishesChart dishes={analytics.topFive.length ? analytics.topFive : [{ name: "No data", qty: 0 }]} />
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Category Performance</h2>
        <table width="100%" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Category</th>
              <th>Qty</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {analytics.categoryList.length === 0 ? (
              <tr>
                <td colSpan="5" align="center" style={{ padding: 10 }}>
                  No category data yet
                </td>
              </tr>
            ) : (
              analytics.categoryList.map((item) => (
                <tr key={item.category}>
                  <td>{item.category}</td>
                  <td align="center">{item.qty}</td>
                  <td align="center">{formatMoney(item.revenue)}</td>
                  <td align="center">{formatMoney(item.cost)}</td>
                  <td align="center">{formatMoney(item.profit)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Dish Performance</h2>
        <table width="100%" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Dish</th>
              <th>Qty</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
              <th>Food Cost %</th>
            </tr>
          </thead>
          <tbody>
            {analytics.dishList.length === 0 ? (
              <tr>
                <td colSpan="6" align="center" style={{ padding: 10 }}>
                  No dish data yet
                </td>
              </tr>
            ) : (
              analytics.dishList.map((item) => {
                const foodCostPct =
                  item.revenue > 0 ? (item.cost / item.revenue) * 100 : 0;

                return (
                  <tr key={item.name}>
                    <td>{item.name}</td>
                    <td align="center">{item.qty}</td>
                    <td align="center">{formatMoney(item.revenue)}</td>
                    <td align="center">{formatMoney(item.cost)}</td>
                    <td align="center">{formatMoney(item.profit)}</td>
                    <td align="center">{foodCostPct.toFixed(1)}%</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <button
        style={{
          marginTop: 20,
          padding: "10px 20px",
          fontSize: 16,
          cursor: "pointer",
        }}
        onClick={saveDay}
      >
        Save Day
      </button>
    </div>
  );
}