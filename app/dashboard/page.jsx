'use client';

import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(res => setData(res || []));
  }, []);

  function analyzeDishes() {
    const map = {};

    data.forEach(day => {
      (day.dishes || []).forEach(d => {
        if (!map[d.name]) {
          map[d.name] = {
            qty: 0,
            revenue: 0,
            cost: 0
          };
        }

        const qty = Number(d.qty) || 0;
        const price = Number(d.price) || 0;
        const cost = Number(d.cost) || 0;

        map[d.name].qty += qty;
        map[d.name].revenue += qty * price;
        map[d.name].cost += qty * cost;
      });
    });

    return Object.keys(map).map(name => {
      const d = map[name];
      const profit = d.revenue - d.cost;
      const margin = d.revenue > 0 ? profit / d.revenue : 0;

      return {
        name,
        qty: d.qty,
        revenue: d.revenue,
        profit,
        margin
      };
    });
  }

  function generateRecommendations(dishes) {
    const recs = [];

    dishes.forEach(d => {
      // 🔥 PRICE INCREASE
      if (d.qty > 20 && d.margin > 0.6) {
        recs.push({
          type: 'increase',
          text: `Increase price for ${d.name} (high demand & strong margin)`
        });
      }

      // ⚠️ LOW MARGIN
      if (d.margin < 0.4) {
        recs.push({
          type: 'warning',
          text: `${d.name} has low margin (${(d.margin * 100).toFixed(1)}%)`
        });
      }

      // 🚀 PROMOTE
      if (d.profit > 5000) {
        recs.push({
          type: 'promote',
          text: `Promote ${d.name} (high profit generator)`
        });
      }
    });

    return recs.slice(0, 6);
  }

  const dishes = analyzeDishes();
  const recommendations = generateRecommendations(dishes);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Smart Dashboard</h1>

        {/* RECOMMENDATIONS */}
        <div style={styles.section}>
          <h2>Smart Recommendations</h2>

          {recommendations.length === 0 && (
            <p>No insights yet — add more data</p>
          )}

          {recommendations.map((r, i) => (
            <div
              key={i}
              style={{
                ...styles.recommendation,
                background:
                  r.type === 'increase'
                    ? '#e3f2fd'
                    : r.type === 'warning'
                    ? '#fdecea'
                    : '#e8f5e9'
              }}
            >
              {r.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: '#f5f1e6',
    minHeight: '100vh',
    padding: 40
  },
  container: {
    maxWidth: 900,
    margin: '0 auto'
  },
  title: {
    marginBottom: 30
  },
  section: {
    background: '#fff',
    padding: 20,
    borderRadius: 10
  },
  recommendation: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 10
  }
};