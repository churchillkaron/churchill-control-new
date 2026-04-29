'use client'

import { useState, useEffect } from 'react'

export default function WastePage() {
  const [type, setType] = useState('ingredient')
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('spoiled')
  const [loading, setLoading] = useState(false)
  const [stockMap, setStockMap] = useState({})
  const [message, setMessage] = useState('')

  const tenant_id = '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'
  const created_by = '195662f5-496d-4a34-b49e-ce7c5bb31824'

  // 🔄 LOAD ITEMS + STOCK
  useEffect(() => {
    async function loadItems() {
      try {
        const endpoint = type === 'ingredient' ? 'ingredients' : 'dishes'

        const res = await fetch(`/api/${endpoint}`)
        const data = await res.json()
        setItems(data || [])

        const stockRes = await fetch(`/api/${endpoint}`)
        const stockData = await stockRes.json()

        const map = {}
        stockData.forEach((s) => {
          const key = endpoint === 'ingredients' ? s.ingredient_id : s.dish_id
          map[key] = s.quantity
        })

        setStockMap(map)

      } catch (err) {
        console.error('Load error:', err)
        setMessage('Error loading data')
      }
    }

    loadItems()
  }, [type])

  // 🚀 SUBMIT
  async function handleSubmit() {
    setMessage('')

    if (!selectedItem || quantity <= 0) {
      setMessage('Fill all fields')
      return
    }

    const currentStock = stockMap[selectedItem] || 0

    if (quantity > currentStock) {
      setMessage(`Cannot waste more than stock (${currentStock})`)
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/waste/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id,
          type,
          item_id: selectedItem,
          quantity,
          reason,
          source: 'kitchen',
          created_by
        })
      })

      const data = await res.json()

      if (data.success) {
        setMessage('✅ Waste recorded')
        setQuantity(1)
        setSelectedItem('')
      } else {
        setMessage(data.error || 'Error saving waste')
      }

    } catch (err) {
      setMessage('Server error')
    }

    setLoading(false)
  }

  const selected = items.find((i) => i.id === selectedItem)

  return (
    <div className="max-w-xl mx-auto text-white space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Waste Entry</h1>
        <p className="text-sm text-white/50 mt-1">
          Record ingredient or dish waste
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        {/* TYPE */}
        <div>
          <label className="text-sm text-white/70">Type</label>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setSelectedItem('')
            }}
            className="input mt-2"
          >
            <option value="ingredient">Ingredient</option>
            <option value="dish">Dish</option>
          </select>
        </div>

        {/* ITEM */}
        <div>
          <label className="text-sm text-white/70">Select Item</label>
          <select
            value={selectedItem}
            onChange={(e) => setSelectedItem(e.target.value)}
            className="input mt-2"
          >
            <option value="">Select...</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {type === 'ingredient' && item.unit ? ` (${item.unit})` : ''}
                {stockMap[item.id] !== undefined ? ` - Stock: ${stockMap[item.id]}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* QUANTITY */}
        <div>
          <label className="text-sm text-white/70">
            Quantity {type === 'ingredient' && selected?.unit ? `(${selected.unit})` : ''}
          </label>
          <input
            type="number"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="input mt-2"
          />

          <p className="text-sm text-white/40 mt-1">
            Current stock: {stockMap[selectedItem] || 0}
          </p>
        </div>

        {/* REASON */}
        <div>
          <label className="text-sm text-white/70">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input mt-2"
          >
            <option value="spoiled">Spoiled</option>
            <option value="expired">Expired</option>
            <option value="burned">Burned</option>
            <option value="returned">Returned</option>
            <option value="overproduction">Overproduction</option>
          </select>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="text-sm text-yellow-400">
            {message}
          </div>
        )}

        {/* BUTTON */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Saving...' : 'Submit Waste'}
        </button>
      </div>
    </div>
  )
}