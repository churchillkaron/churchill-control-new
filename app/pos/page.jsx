'use client'

import { useMemo, useState } from 'react'

const THEME = {
  bg: '#0b0b0b',
  panel: '#141414',
  border: '#2a2a2a',
  soft: '#1b1b1b',
  text: '#f5f0e6',
  muted: '#b8aa8a',
  orange: '#d97706',
  khaki: '#c2b280',
  red: '#7f1d1d',
}

/* 🔥 REAL MENU */

const MENU_ITEMS = [
  // BREAKFAST
  { id: 1, name: 'English Breakfast', price: 290, category: 'Breakfast' },
  { id: 2, name: 'All Day Breakfast', price: 250, category: 'Breakfast' },

  // BURGERS
  { id: 3, name: 'Classic Cheeseburger', price: 280, category: 'Burgers' },
  { id: 4, name: 'Double Beef Burger', price: 350, category: 'Burgers' },
  { id: 5, name: 'Pulled Beef Burger', price: 320, category: 'Burgers' },

  // PIZZA
  { id: 6, name: 'Margherita Pizza', price: 320, category: 'Pizza' },
  { id: 7, name: 'Pepperoni Pizza', price: 360, category: 'Pizza' },
  { id: 8, name: 'BBQ Chicken Pizza', price: 380, category: 'Pizza' },

  // PASTA
  { id: 9, name: 'Pulled Beef Pasta', price: 350, category: 'Pasta' },
  { id: 10, name: 'Carbonara', price: 320, category: 'Pasta' },

  // SANDWICH
  { id: 11, name: 'Steak Sandwich', price: 340, category: 'Sandwich' },
  { id: 12, name: 'Chicken Sandwich', price: 280, category: 'Sandwich' },

  // MAINS
  { id: 13, name: 'Fish and Chips', price: 330, category: 'Mains' },
  { id: 14, name: 'Grilled Chicken', price: 310, category: 'Mains' },

  // BAKERY
  { id: 15, name: 'Tosca Roll', price: 120, category: 'Bakery' },
  { id: 16, name: 'Cinnamon Roll', price: 110, category: 'Bakery' },
  { id: 17, name: 'Chocolate Lava Cake', price: 150, category: 'Bakery' },

  // DRINKS
  { id: 18, name: 'Peach Soda', price: 95, category: 'Drinks' },
  { id: 19, name: 'Americano', price: 90, category: 'Drinks' },
  { id: 20, name: 'Latte', price: 110, category: 'Drinks' },
]

function formatTHB(value) {
  return `THB ${Number(value || 0).toLocaleString()}`
}

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('All')

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(MENU_ITEMS.map(i => i.category)))]
  }, [])

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter(item =>
      selectedCategory === 'All' || item.category === selectedCategory
    )
  }, [selectedCategory])

  const addItem = (item) => {
    setOrderItems(prev => {
      const exist = prev.find(i => i.id === item.id)
      if (exist) {
        return prev.map(i =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i
        )
      }
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const total = orderItems.reduce((s, i) => s + i.price * i.qty, 0)

  return (
    <div style={{ padding: 30, background: THEME.bg, color: THEME.text }}>

      <h1 style={{ color: THEME.orange }}>Churchill POS</h1>

      {/* CATEGORY FILTER */}
      <div style={{ marginBottom: 20 }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              marginRight: 10,
              padding: 10,
              background: selectedCategory === cat ? THEME.orange : THEME.soft,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* MENU */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {filteredItems.map(item => (
          <div
            key={item.id}
            onClick={() => addItem(item)}
            style={{
              padding: 15,
              background: THEME.panel,
              borderRadius: 10,
              cursor: 'pointer'
            }}
          >
            <div>{item.name}</div>
            <div style={{ color: THEME.khaki }}>
              {formatTHB(item.price)}
            </div>
          </div>
        ))}
      </div>

      {/* ORDER */}
      <div style={{ marginTop: 30 }}>
        <h2>Order</h2>

        {orderItems.map(i => (
          <div key={i.id}>
            {i.name} x{i.qty} = {formatTHB(i.qty * i.price)}
          </div>
        ))}

        <h3>Total: {formatTHB(total)}</h3>
      </div>

    </div>
  )
}