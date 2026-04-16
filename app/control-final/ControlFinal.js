'use client'

import { useState } from 'react'

export default function ControlFinal() {
  const [items, setItems] = useState([])
  const [staff, setStaff] = useState('John')

  // Add item with staff
  const addItem = () => {
    const newItem = {
      name: 'Item',
      category: 'food',
      quantity: 1,
      price: 100,
      staff: staff
    }

    setItems([...items, newItem])
  }

  // Update item field
  const updateItem = (index, field, value) => {
    const updated = [...items]
    updated[index][field] = value
    setItems(updated)
  }

  // Save day
  const saveDay = async () => {
    await fetch('/api/save-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        total: items.reduce((sum, i) => sum + (i.price * i.quantity), 0)
      })
    })

    alert('Saved')
    setItems([])
  }

  return (
    <div style={{ padding: 20 }}>

      <h2>Control Panel</h2>

      {/* STAFF SELECTOR */}
      <div style={{ marginBottom: 20 }}>
        <label>Staff:</label>
        <select value={staff} onChange={(e) => setStaff(e.target.value)}>
          <option value="John">John</option>
          <option value="Anna">Anna</option>
          <option value="Mike">Mike</option>
        </select>
      </div>

      {/* ADD ITEM */}
      <button onClick={addItem}>Add Item</button>

      {/* ITEM LIST */}
      {items.map((item, index) => (
        <div key={index} style={{ marginTop: 10, borderBottom: '1px solid #ccc' }}>

          <input
            value={item.name}
            onChange={(e) => updateItem(index, 'name', e.target.value)}
            placeholder="Name"
          />

          <input
            value={item.category}
            onChange={(e) => updateItem(index, 'category', e.target.value)}
            placeholder="Category"
          />

          <input
            type="number"
            value={item.quantity}
            onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
          />

          <input
            type="number"
            value={item.price}
            onChange={(e) => updateItem(index, 'price', Number(e.target.value))}
          />

          {/* STAFF PER ITEM */}
          <select
            value={item.staff}
            onChange={(e) => updateItem(index, 'staff', e.target.value)}
          >
            <option value="John">John</option>
            <option value="Anna">Anna</option>
            <option value="Mike">Mike</option>
          </select>

        </div>
      ))}

      {/* SAVE */}
      <button style={{ marginTop: 20 }} onClick={saveDay}>
        Save Day
      </button>

    </div>
  )
}