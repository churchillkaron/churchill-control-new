"use client";

import { useRef, useState } from "react";

const DISHES = [
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
  { name: "Pad Ka Prow", category: "Main", price: 150, cost: 36.91 },
  { name: "Chicken Cashew Nuts", category: "Main", price: 180, cost: 68.04 },
  { name: "Beef with Oyster Sauce", category: "Main", price: 220, cost: 160.53 },
  { name: "Massaman Curry", category: "Main", price: 180, cost: 90.96 },
  { name: "Green Curry", category: "Main", price: 170, cost: 80.77 },
  { name: "Panang Curry", category: "Main", price: 175, cost: 71.9 },
  { name: "Pineapple Fried Rice", category: "Main", price: 160, cost: 54.36 },
];

function money(value) {
  return Number(value || 0).toFixed(0);
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function roundToTen(value) {
  return Math.ceil(Number(value || 0) / 10) * 10;
}

function classifyDish(item, avgQty, avgProfit) {
  const highPopularity = item.qty >= avgQty;
  const highProfit = item.profitPerUnit >= avgProfit;

  if (highPopularity && highProfit) return "Star";
  if (highPopularity && !highProfit) return "Plowhorse";
  if (!highPopularity && highProfit) return "Puzzle";
  return "Dog";
}

export default function ControlFinal() {
  const [rows, setRows] = useState([{ dish: "", qty: 1, price: 0, cost: 0 }]);
  const [search, setSearch] = useState("");
  const inputRefs = useRef([]);

  const filteredDishes = DISHES.filter((dish) =>
    dish.name.toLowerCase().includes(search.toLowerCase())
  );

  const updateDish = (index, value) => {
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

  const updateQty = (index, value) => {
    const updated = [...rows];
    updated[index].qty = Math.max(0, Number(value) || 0);
    setRows(updated);
  };

  const addRow = () => {
    setRows([...rows, { dish: "", qty: 1, price: 0, cost: 0 }]);

    setTimeout(() => {
      const nextIndex = rows.length;
      if (inputRefs.current[nextIndex]) {
        inputRefs.current[nextIndex].focus();
      }
    }, 50);
  };

  const removeRow = () => {
    if (rows.length > 1) {
      setRows(rows.slice(0, -1));
    }
  };

  const handleDishKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const qtyInput = document.getElementById(`qty-${index}`);
      if (qtyInput) qtyInput.focus();
    }

    if (e.key === "ArrowDown" && index < rows.length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }

    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }

    if (e.key === "Backspace" && rows[index].dish === "" && rows.length > 1) {
      e.preventDefault();
      const updated = rows.filter((_, i) => i !== index);
      setRows(updated);

      setTimeout(() => {
        const prevIndex = index > 0 ? index - 1 : 0;
        inputRefs.current[prevIndex]?.focus();
      }, 50);
    }
  };

  const handleQtyKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (index === rows.length - 1) {
        addRow();
      } else {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const totals = (() => {
    let revenue = 0;
    let cost = 0;
    let qty = 0;

    rows.forEach((row) => {
      revenue += Number(row.price || 0) * Number(row.qty || 0);
      cost += Number(row.cost || 0) * Number(row.qty || 0);
      qty += Number(row.qty || 0);
    });

    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      qty,
    };
  })();

  const analytics = (() => {
    const dishMap = {};

    rows.forEach((row) => {
      if (!row.dish || !row.qty) return;

      if (!dishMap[row.dish]) {
        dishMap[row.dish] = {
          name: row.dish,
          qty: 0,
          revenue: 0,
          cost: 0,
          price: Number(row.price || 0),
          unitCost: Number(row.cost || 0),
        };
      }

      dishMap[row.dish].qty += Number(row.qty || 0);
      dishMap[row.dish].revenue += Number(row.price || 0) * Number(row.qty || 0);
      dishMap[row.dish].cost += Number(row.cost || 0) * Number(row.qty || 0);
    });

    const list = Object.values(dishMap).map((item) => {
      const profit = item.revenue - item.cost;
      const profitPerUnit = item.qty > 0 ? profit / item.qty : 0;
      const foodCostPct = item.revenue > 0 ? (item.cost / item.revenue) * 100 : 0;
      return {
        ...item,
        profit,
        profitPerUnit,
        foodCostPct,
      };
    });

    const avgQty =
      list.length > 0 ? list.reduce((sum, item) => sum + item.qty, 0) / list.length : 0;

    const avgProfit =
      list.length > 0
        ? list.reduce((sum, item) => sum + item.profitPerUnit, 0) / list.length
        : 0;

    const classifiedList = list
      .map((item) => {
        const classification = classifyDish(item, avgQty, avgProfit);
        const targetPrice30 = item.unitCost > 0 ? roundToTen(item.unitCost / 0.3) : item.price;
        const targetPrice35 = item.unitCost > 0 ? roundToTen(item.unitCost / 0.35) : item.price;
        const priceGap30 = targetPrice30 - item.price;
        const priceGap35 = targetPrice35 - item.price;

        return {
          ...item,
          classification,
          targetPrice30,
          targetPrice35,
          priceGap30,
          priceGap35,
        };
      })
      .sort((a, b) => b.qty - a.qty);

    const stars = classifiedList.filter((item) => item.classification === "Star");
    const plowhorses = classifiedList.filter((item) => item.classification === "Plowhorse");
    const puzzles = classifiedList.filter((item) => item.classification === "Puzzle");
    const dogs = classifiedList.filter((item) => item.classification === "Dog");

    return {
      list: classifiedList,
      avgQty,
      avgProfit,
      top: classifiedList[0] || null,
      bestProfit:
        [...classifiedList].sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0] || null,
      worstCost:
        [...classifiedList].sort((a, b) => b.foodCostPct - a.foodCostPct)[0] || null,
      stars,
      plowhorses,
      puzzles,
      dogs,
    };
  })();

  const aiManager = (() => {
    const messages = [];

    if (!totals.revenue) {
      messages.push("⚠️ No sales data yet — enter real sales to unlock price advice and menu actions.");
      return messages;
    }

    if (totals.margin < 50) {
      messages.push(
        `🔴 Total margin is only ${percent(
          totals.margin
        )} — raise prices on weak dishes or reduce food cost immediately.`
      );
    } else {
      messages.push(`🟢 Total margin is healthy at ${percent(totals.margin)}.`);
    }

    if (analytics.worstCost && analytics.worstCost.foodCostPct > 45) {
      messages.push(
        `🟡 ${analytics.worstCost.name} has very high food cost at ${percent(
          analytics.worstCost.foodCostPct
        )}. Current price ${money(analytics.worstCost.price)} THB. Target around ${money(
          analytics.worstCost.targetPrice35
        )}-${money(analytics.worstCost.targetPrice30)} THB.`
      );
    }

    if (analytics.bestProfit) {
      messages.push(
        `🟢 Push ${analytics.bestProfit.name} — strongest profit per plate at ${money(
          analytics.bestProfit.profitPerUnit
        )} THB.`
      );
    }

    if (analytics.top) {
      messages.push(
        `🔵 ${analytics.top.name} is your top seller with ${analytics.top.qty} sold — use it for upsell and visibility.`
      );
    }

    if (analytics.plowhorses.length > 0) {
      const item = analytics.plowhorses[0];
      messages.push(
        `🟠 ${item.name} is a Plowhorse — sells well but profit is weak. Test a price move from ${money(
          item.price
        )} to ${money(item.targetPrice35)} THB.`
      );
    }

    if (analytics.puzzles.length > 0) {
      const item = analytics.puzzles[0];
      messages.push(
        `🟣 ${item.name} is a Puzzle — profit is good but sales are low. Promote it harder on menu and staff recommendations.`
      );
    }

    if (analytics.dogs.length > 0) {
      const item = analytics.dogs[0];
      messages.push(
        `⚫ ${item.name} is a Dog — low popularity and weak return. Consider removing, redesigning, or repricing it.`
      );
    }

    return messages;
  })();

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

    alert("Saved");
  };

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "Arial",
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ marginBottom: 6 }}>Churchill Control Panel</h1>
        <div style={{ color: "#777" }}>Live Restaurant Intelligence</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 18,
            minWidth: 180,
            background: "#fafafa",
          }}
        >
          <strong>Revenue</strong>
          <div style={{ marginTop: 8, fontSize: 24 }}>{money(totals.revenue)} THB</div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 18,
            minWidth: 180,
            background: "#fafafa",
          }}
        >
          <strong>Profit</strong>
          <div style={{ marginTop: 8, fontSize: 24 }}>{money(totals.profit)} THB</div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 18,
            minWidth: 180,
            background: "#fafafa",
          }}
        >
          <strong>Margin</strong>
          <div style={{ marginTop: 8, fontSize: 24 }}>{percent(totals.margin)}</div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 18,
            minWidth: 180,
            background: "#fafafa",
          }}
        >
          <strong>Dishes Sold</strong>
          <div style={{ marginTop: 8, fontSize: 24 }}>{totals.qty}</div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 24,
          marginBottom: 24,
          background: "#fff",
        }}
      >
        <strong style={{ fontSize: 18 }}>AI Manager</strong>

        <div style={{ marginTop: 14 }}>
          {aiManager.map((message, index) => (
            <div key={index} style={{ marginBottom: 10, lineHeight: 1.5 }}>
              {message}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 24,
          marginBottom: 24,
          background: "#fff",
        }}
      >
        <strong style={{ fontSize: 18 }}>Control Input</strong>

        <input
          placeholder="Search dish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            marginTop: 16,
            marginBottom: 16,
          }}
        />

        <table width="100%" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left" style={{ paddingBottom: 10 }}>Dish</th>
              <th style={{ paddingBottom: 10 }}>Qty</th>
              <th style={{ paddingBottom: 10 }}>Price</th>
              <th style={{ paddingBottom: 10 }}>Cost</th>
              <th style={{ paddingBottom: 10 }}>Total</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td style={{ paddingBottom: 10 }}>
                  <select
                    ref={(el) => (inputRefs.current[index] = el)}
                    value={row.dish}
                    onChange={(e) => updateDish(index, e.target.value)}
                    onKeyDown={(e) => handleDishKeyDown(e, index)}
                    style={{ width: "100%" }}
                  >
                    <option value="">Select</option>
                    {filteredDishes.map((dish) => (
                      <option key={dish.name} value={dish.name}>
                        {dish.name}
                      </option>
                    ))}
                  </select>
                </td>

                <td align="center" style={{ paddingBottom: 10 }}>
                  <input
                    id={`qty-${index}`}
                    type="number"
                    value={row.qty}
                    onChange={(e) => updateQty(index, e.target.value)}
                    onKeyDown={(e) => handleQtyKeyDown(e, index)}
                    style={{ width: 70 }}
                  />
                </td>

                <td align="center" style={{ paddingBottom: 10 }}>
                  {money(row.price)}
                </td>

                <td align="center" style={{ paddingBottom: 10 }}>
                  {money(row.cost)}
                </td>

                <td align="center" style={{ paddingBottom: 10 }}>
                  {money(row.price * row.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 18 }}>
          <button onClick={addRow} style={{ marginRight: 10 }}>
            Add Row
          </button>
          <button onClick={removeRow} style={{ marginRight: 10 }}>
            Remove Row
          </button>
          <button onClick={saveDay}>Save Day</button>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 24,
          marginBottom: 24,
          background: "#fff",
        }}
      >
        <strong style={{ fontSize: 18 }}>Menu Engineering</strong>

        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginTop: 16,
          }}
        >
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 14,
              minWidth: 150,
              background: "#fafafa",
            }}
          >
            <strong>Stars</strong>
            <div style={{ marginTop: 6 }}>{analytics.stars.length}</div>
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 14,
              minWidth: 150,
              background: "#fafafa",
            }}
          >
            <strong>Plowhorses</strong>
            <div style={{ marginTop: 6 }}>{analytics.plowhorses.length}</div>
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 14,
              minWidth: 150,
              background: "#fafafa",
            }}
          >
            <strong>Puzzles</strong>
            <div style={{ marginTop: 6 }}>{analytics.puzzles.length}</div>
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 14,
              minWidth: 150,
              background: "#fafafa",
            }}
          >
            <strong>Dogs</strong>
            <div style={{ marginTop: 6 }}>{analytics.dogs.length}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 24,
          background: "#fff",
        }}
      >
        <strong style={{ fontSize: 18 }}>Dish Decisions</strong>

        <table width="100%" style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th align="left" style={{ paddingBottom: 10 }}>Dish</th>
              <th style={{ paddingBottom: 10 }}>Qty</th>
              <th style={{ paddingBottom: 10 }}>Class</th>
              <th style={{ paddingBottom: 10 }}>Food Cost</th>
              <th style={{ paddingBottom: 10 }}>Profit / Unit</th>
              <th style={{ paddingBottom: 10 }}>Current</th>
              <th style={{ paddingBottom: 10 }}>Target</th>
              <th align="left" style={{ paddingBottom: 10 }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {analytics.list.length === 0 ? (
              <tr>
                <td colSpan="8" align="center" style={{ padding: 14 }}>
                  No dish analytics yet
                </td>
              </tr>
            ) : (
              analytics.list.map((item) => {
                let action = "Keep monitoring";

                if (item.classification === "Star") {
                  action = "Push harder and protect quality";
                } else if (item.classification === "Plowhorse") {
                  action = `Increase price toward ${money(item.targetPrice35)} THB`;
                } else if (item.classification === "Puzzle") {
                  action = "Promote more strongly on menu and through staff";
                } else if (item.classification === "Dog") {
                  action = "Consider removing or redesigning";
                }

                return (
                  <tr key={item.name}>
                    <td style={{ paddingBottom: 10 }}>{item.name}</td>
                    <td align="center" style={{ paddingBottom: 10 }}>{item.qty}</td>
                    <td align="center" style={{ paddingBottom: 10 }}>{item.classification}</td>
                    <td align="center" style={{ paddingBottom: 10 }}>{percent(item.foodCostPct)}</td>
                    <td align="center" style={{ paddingBottom: 10 }}>{money(item.profitPerUnit)}</td>
                    <td align="center" style={{ paddingBottom: 10 }}>{money(item.price)}</td>
                    <td align="center" style={{ paddingBottom: 10 }}>
                      {money(item.targetPrice35)}-{money(item.targetPrice30)}
                    </td>
                    <td style={{ paddingBottom: 10 }}>{action}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}