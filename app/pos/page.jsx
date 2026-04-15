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
  green: '#14532d',
}

const MENU_ITEMS = [
  { id: 1, name: 'English Breakfast', price: 290, category: 'Breakfast' },
  { id: 2, name: 'Chicken Caesar Salad', price: 260, category: 'Salad' },
  { id: 3, name: 'Margherita Pizza', price: 320, category: 'Pizza' },
  { id: 4, name: 'Pepperoni Pizza', price: 360, category: 'Pizza' },
  { id: 5, name: 'Cheeseburger', price: 280, category: 'Burger' },
  { id: 6, name: 'Steak Sandwich', price: 340, category: 'Sandwich' },
  { id: 7, name: 'Pulled Beef Pasta', price: 350, category: 'Pasta' },
  { id: 8, name: 'Fish and Chips', price: 330, category: 'Main' },
  { id: 9, name: 'Tosca Roll', price: 120, category: 'Bakery' },
  { id: 10, name: 'Cinnamon Roll', price: 110, category: 'Bakery' },
  { id: 11, name: 'Peach Soda', price: 95, category: 'Drinks' },
  { id: 12, name: 'Americano', price: 90, category: 'Drinks' },
]

function formatTHB(value) {
  return `THB ${Number(value || 0).toLocaleString()}`
}

function formatReceiptTime(value) {
  if (!value) return '-'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [serviceCharge, setServiceCharge] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [cashReceived, setCashReceived] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(MENU_ITEMS.map((item) => item.category)))]
  }, [])

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      const categoryMatch =
        selectedCategory === 'All' || item.category === selectedCategory
      const searchMatch = item.name.toLowerCase().includes(search.toLowerCase())
      return categoryMatch && searchMatch
    })
  }, [selectedCategory, search])

  const addItem = (menuItem) => {
    setOrderItems((prev) => {
      const existing = prev.find((item) => item.id === menuItem.id)

      if (existing) {
        return prev.map((item) =>
          item.id === menuItem.id
            ? { ...item, qty: item.qty + 1 }
            : item
        )
      }

      return [
        ...prev,
        {
          id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          qty: 1,
          note: '',
        },
      ]
    })
  }

  const increaseQty = (id) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, qty: item.qty + 1 } : item
      )
    )
  }

  const decreaseQty = (id) => {
    setOrderItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, qty: item.qty - 1 } : item
        )
        .filter((item) => item.qty > 0)
    )
  }

  const removeItem = (id) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id))
  }

  const updateItemNote = (id, value) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, note: value } : item
      )
    )
  }

  const subtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + item.price * item.qty, 0)
  }, [orderItems])

  const total = useMemo(() => {
    return subtotal + Number(serviceCharge || 0) - Number(discount || 0)
  }, [subtotal, serviceCharge, discount])

  const change = useMemo(() => {
    const cash = Number(cashReceived || 0)
    return cash - total
  }, [cashReceived, total])

  const resetSale = () => {
    setOrderItems([])
    setServiceCharge(0)
    setDiscount(0)
    setCashReceived('')
    setOrderNote('')
    setSaveError('')
  }

  const completeSale = async () => {
    setSaveError('')
    setLastReceipt(null)

    if (!orderItems.length) {
      setSaveError('Add at least one item before completing the sale.')
      return
    }

    if (total < 0) {
      setSaveError('Total cannot be negative.')
      return
    }

    if (Number(cashReceived || 0) < total) {
      setSaveError('Cash received is lower than total.')
      return
    }

    try {
      setIsSaving(true)

      const response = await fetch('/api/save-sale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: orderItems,
          subtotal,
          service: Number(serviceCharge || 0),
          discount: Number(discount || 0),
          total,
          cash: Number(cashReceived || 0),
          change,
          note: orderNote,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save sale.')
      }

      setLastReceipt({
        id: result.receiptId,
        createdAt: result.createdAt,
        total,
      })

      setOrderItems([])
      setServiceCharge(0)
      setDiscount(0)
      setCashReceived('')
      setOrderNote('')
    } catch (error) {
      setSaveError(error.message || 'Failed to save sale.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: THEME.bg,
        color: THEME.text,
        padding: '24px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '1500px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            border: `1px solid ${THEME.border}`,
            background: THEME.panel,
            borderRadius: '18px',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: THEME.orange,
                  fontWeight: 800,
                  fontSize: '28px',
                  letterSpacing: '1px',
                }}
              >
                CC
              </div>
              <div
                style={{
                  color: THEME.text,
                  fontSize: '24px',
                  fontWeight: 700,
                }}
              >
                Churchill Karon POS
              </div>
              <div
                style={{
                  color: THEME.muted,
                  marginTop: '6px',
                  fontSize: '14px',
                }}
              >
                Cashier sales input with saved receipt tracking
              </div>
            </div>

            <div
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                background: THEME.soft,
                border: `1px solid ${THEME.border}`,
                color: THEME.khaki,
                fontWeight: 600,
              }}
            >
              Live Total: {formatTHB(total)}
            </div>
          </div>
        </div>

        {lastReceipt && (
          <div
            style={{
              marginBottom: '20px',
              border: `1px solid ${THEME.green}`,
              background: '#0f1f15',
              borderRadius: '18px',
              padding: '16px',
            }}
          >
            <div
              style={{
                color: THEME.khaki,
                fontWeight: 800,
                marginBottom: '8px',
              }}
            >
              Sale saved successfully
            </div>
            <div style={{ marginBottom: '4px' }}>
              Receipt ID: <strong>{lastReceipt.id}</strong>
            </div>
            <div style={{ marginBottom: '4px' }}>
              Saved at: <strong>{formatReceiptTime(lastReceipt.createdAt)}</strong>
            </div>
            <div>
              Sale total: <strong>{formatTHB(lastReceipt.total)}</strong>
            </div>
          </div>
        )}

        {saveError && (
          <div
            style={{
              marginBottom: '20px',
              border: `1px solid ${THEME.red}`,
              background: '#2a1111',
              borderRadius: '18px',
              padding: '16px',
              color: '#f5d0d0',
              fontWeight: 700,
            }}
          >
            {saveError}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: '20px',
          }}
        >
          <div
            style={{
              border: `1px solid ${THEME.border}`,
              background: THEME.panel,
              borderRadius: '18px',
              padding: '20px',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              Menu
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                marginBottom: '14px',
              }}
            >
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: `1px solid ${
                      selectedCategory === category ? THEME.orange : THEME.border
                    }`,
                    background:
                      selectedCategory === category ? THEME.orange : THEME.soft,
                    color:
                      selectedCategory === category ? '#111111' : THEME.text,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {category}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search menu item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: `1px solid ${THEME.border}`,
                background: THEME.soft,
                color: THEME.text,
                outline: 'none',
                marginBottom: '18px',
              }}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px',
              }}
            >
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addItem(item)}
                  style={{
                    textAlign: 'left',
                    padding: '16px',
                    borderRadius: '16px',
                    border: `1px solid ${THEME.border}`,
                    background: THEME.soft,
                    color: THEME.text,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '16px',
                      marginBottom: '6px',
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      color: THEME.muted,
                      fontSize: '13px',
                      marginBottom: '8px',
                    }}
                  >
                    {item.category}
                  </div>
                  <div
                    style={{
                      color: THEME.khaki,
                      fontWeight: 700,
                    }}
                  >
                    {formatTHB(item.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${THEME.border}`,
              background: THEME.panel,
              borderRadius: '18px',
              padding: '20px',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              Current Sale
            </div>

            {orderItems.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '14px',
                  background: THEME.soft,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.muted,
                }}
              >
                No items added yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginBottom: '18px',
                }}
              >
                {orderItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: `1px solid ${THEME.border}`,
                      background: THEME.soft,
                      borderRadius: '14px',
                      padding: '14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        <div style={{ color: THEME.khaki, marginTop: '4px' }}>
                          {formatTHB(item.price)} each
                        </div>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        style={{
                          background: THEME.red,
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        onClick={() => decreaseQty(item.id)}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          border: 'none',
                          background: THEME.border,
                          color: THEME.text,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        -
                      </button>

                      <div
                        style={{
                          minWidth: '42px',
                          textAlign: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {item.qty}
                      </div>

                      <button
                        onClick={() => increaseQty(item.id)}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          border: 'none',
                          background: THEME.orange,
                          color: '#111111',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        +
                      </button>

                      <div
                        style={{
                          marginLeft: 'auto',
                          fontWeight: 700,
                          color: THEME.khaki,
                        }}
                      >
                        {formatTHB(item.price * item.qty)}
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Item note..."
                      value={item.note}
                      onChange={(e) => updateItemNote(item.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: `1px solid ${THEME.border}`,
                        background: THEME.panel,
                        color: THEME.text,
                        outline: 'none',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gap: '12px',
                marginBottom: '18px',
              }}
            >
              <textarea
                placeholder="Order note..."
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${THEME.border}`,
                  background: THEME.soft,
                  color: THEME.text,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />

              <input
                type="number"
                placeholder="Service charge"
                value={serviceCharge}
                onChange={(e) => setServiceCharge(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${THEME.border}`,
                  background: THEME.soft,
                  color: THEME.text,
                  outline: 'none',
                }}
              />

              <input
                type="number"
                placeholder="Discount"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${THEME.border}`,
                  background: THEME.soft,
                  color: THEME.text,
                  outline: 'none',
                }}
              />

              <input
                type="number"
                placeholder="Cash received"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${THEME.border}`,
                  background: THEME.soft,
                  color: THEME.text,
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                border: `1px solid ${THEME.border}`,
                background: THEME.soft,
                borderRadius: '16px',
                padding: '16px',
                display: 'grid',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: THEME.muted }}>Subtotal</span>
                <strong>{formatTHB(subtotal)}</strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: THEME.muted }}>Service</span>
                <strong>{formatTHB(serviceCharge)}</strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: THEME.muted }}>Discount</span>
                <strong>- {formatTHB(discount)}</strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '20px',
                  paddingTop: '8px',
                  borderTop: `1px solid ${THEME.border}`,
                }}
              >
                <span>Total</span>
                <strong style={{ color: THEME.orange }}>{formatTHB(total)}</strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: THEME.muted }}>Change</span>
                <strong
                  style={{
                    color: change >= 0 ? THEME.khaki : '#ef4444',
                  }}
                >
                  {formatTHB(change)}
                </strong>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
              }}
            >
              <button
                onClick={resetSale}
                disabled={isSaving}
                style={{
                  padding: '14px',
                  borderRadius: '14px',
                  border: `1px solid ${THEME.border}`,
                  background: THEME.soft,
                  color: THEME.text,
                  fontWeight: 700,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                Reset Sale
              </button>

              <button
                onClick={completeSale}
                disabled={isSaving}
                style={{
                  padding: '14px',
                  borderRadius: '14px',
                  border: 'none',
                  background: THEME.orange,
                  color: '#111111',
                  fontWeight: 800,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? 'Saving Sale...' : 'Complete Sale'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}