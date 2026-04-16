'use client'

import { useEffect, useMemo, useState } from 'react'

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

const CATEGORY_ORDER = [
  'All',
  'Starter',
  'Main Course',
  'Dessert',
  'Beer',
  'Wine',
  'Soft Drink',
  'Champagne',
]

const STAFF_OPTIONS = ['John', 'Anna', 'Mike']

const MENU_ITEMS = [
  { id: 1, name: 'Beef Carpaccio', price: 320, category: 'Starter' },
  { id: 2, name: 'Chili & Garlic Prawns', price: 320, category: 'Starter' },
  { id: 3, name: 'Signature Bruschetta', price: 280, category: 'Starter' },
  { id: 4, name: 'Seared Scallops', price: 520, category: 'Starter' },
  { id: 5, name: 'Mango & Tomato Salad', price: 220, category: 'Starter' },
  { id: 6, name: 'Tom Yum Goong', price: 180, category: 'Starter' },
  { id: 7, name: 'Tom Kha Gai', price: 170, category: 'Starter' },
  { id: 8, name: 'Churchill Beef Short Ribs', price: 890, category: 'Main Course' },
  { id: 9, name: 'Ribeye Steak', price: 890, category: 'Main Course' },
  { id: 10, name: 'Beef Tenderloin', price: 920, category: 'Main Course' },
  { id: 11, name: 'Pork Tenderloin', price: 460, category: 'Main Course' },
  { id: 12, name: 'Salmon', price: 690, category: 'Main Course' },
  { id: 13, name: 'Churchill Sambal Half Chicken', price: 590, category: 'Main Course' },
  { id: 14, name: 'Veal Stew', price: 850, category: 'Main Course' },
  { id: 15, name: 'Pad Thai', price: 160, category: 'Main Course' },
  { id: 16, name: 'Pad Ka Prow', price: 150, category: 'Main Course' },
  { id: 17, name: 'Stir-Fried Chicken with Cashew Nuts', price: 180, category: 'Main Course' },
  { id: 18, name: 'Beef with Oyster Sauce', price: 220, category: 'Main Course' },
  { id: 19, name: 'Massaman Curry', price: 180, category: 'Main Course' },
  { id: 20, name: 'Green Curry', price: 170, category: 'Main Course' },
  { id: 21, name: 'Panang Curry', price: 175, category: 'Main Course' },
  { id: 22, name: 'Pineapple Fried Rice', price: 160, category: 'Main Course' },
  { id: 23, name: 'Potato Gratin', price: 120, category: 'Main Course' },
  { id: 24, name: 'Crispy Potato Wedges', price: 100, category: 'Main Course' },
  { id: 25, name: 'Cauliflower Puree', price: 120, category: 'Main Course' },
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
  const [customers, setCustomers] = useState(1)
  const [defaultStaff, setDefaultStaff] = useState(STAFF_OPTIONS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)
  const [sales, setSales] = useState([])
  const [loadingSales, setLoadingSales] = useState(false)

  const categories = useMemo(() => {
    const menuCategories = Array.from(new Set(MENU_ITEMS.map((item) => item.category)))
    return CATEGORY_ORDER.filter((cat) => cat === 'All' || menuCategories.includes(cat))
  }, [])

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      const categoryMatch =
        selectedCategory === 'All' || item.category === selectedCategory
      const searchMatch = item.name.toLowerCase().includes(search.toLowerCase())
      return categoryMatch && searchMatch
    })
  }, [selectedCategory, search])

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

  const totalRevenue = useMemo(() => {
    return sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  }, [sales])

  const avgTicket = useMemo(() => {
    if (!sales.length) return 0
    return totalRevenue / sales.length
  }, [sales, totalRevenue])

  const fetchSales = async () => {
    setLoadingSales(true)
    try {
      const res = await fetch('/api/pos-today')
      const data = await res.json()
      setSales(data.data || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingSales(false)
    }
  }

  useEffect(() => {
    fetchSales()
  }, [])

  const addItem = (menuItem) => {
    setOrderItems((prev) => [
      ...prev,
      {
        lineId: `${menuItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        qty: 1,
        note: '',
        category: menuItem.category,
        staff: defaultStaff,
      },
    ])
  }

  const increaseQty = (lineId) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.lineId === lineId ? { ...item, qty: item.qty + 1 } : item
      )
    )
  }

  const decreaseQty = (lineId) => {
    setOrderItems((prev) =>
      prev
        .map((item) =>
          item.lineId === lineId ? { ...item, qty: item.qty - 1 } : item
        )
        .filter((item) => item.qty > 0)
    )
  }

  const removeItem = (lineId) => {
    setOrderItems((prev) => prev.filter((item) => item.lineId !== lineId))
  }

  const updateItemNote = (lineId, value) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.lineId === lineId ? { ...item, note: value } : item
      )
    )
  }

  const updateItemStaff = (lineId, value) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.lineId === lineId ? { ...item, staff: value } : item
      )
    )
  }

  const resetSale = () => {
    setOrderItems([])
    setServiceCharge(0)
    setDiscount(0)
    setCashReceived('')
    setOrderNote('')
    setCustomers(1)
    setSaveError('')
  }

  const completeSale = async () => {
    setSaveError('')
    setLastReceipt(null)

    if (!orderItems.length) {
      setSaveError('Add at least one item before completing the sale.')
      return
    }

    if (Number(customers || 0) < 1) {
      setSaveError('Customers must be at least 1.')
      return
    }

    if (orderItems.some((item) => !item.staff)) {
      setSaveError('Every item must have a staff member assigned.')
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
          items: orderItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            qty: item.qty,
            quantity: item.qty,
            note: item.note,
            category: item.category,
            staff: item.staff,
          })),
          subtotal,
          service: Number(serviceCharge || 0),
          discount: Number(discount || 0),
          total,
          cash: Number(cashReceived || 0),
          change,
          note: orderNote,
          customers: Number(customers || 1),
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

      resetSale()
      fetchSales()
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
            gridTemplateColumns: '1.1fr 0.95fr',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              display: 'grid',
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
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '20px',
                  borderBottom: `1px solid ${THEME.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>
                    Today’s Receipts
                  </div>
                  <div style={{ color: THEME.muted, marginTop: '4px', fontSize: '14px' }}>
                    Live sales overview
                  </div>
                </div>

                <button
                  onClick={fetchSales}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: 'none',
                    background: THEME.orange,
                    color: '#111111',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Refresh Sales
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '16px',
                  padding: '20px',
                  borderBottom: `1px solid ${THEME.border}`,
                }}
              >
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: THEME.soft,
                    border: `1px solid ${THEME.border}`,
                  }}
                >
                  <div style={{ color: THEME.muted, fontSize: '14px', marginBottom: '6px' }}>
                    Sales
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800 }}>{sales.length}</div>
                </div>

                <div
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: THEME.soft,
                    border: `1px solid ${THEME.border}`,
                  }}
                >
                  <div style={{ color: THEME.muted, fontSize: '14px', marginBottom: '6px' }}>
                    Revenue
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800 }}>{formatTHB(totalRevenue)}</div>
                </div>

                <div
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: THEME.soft,
                    border: `1px solid ${THEME.border}`,
                  }}
                >
                  <div style={{ color: THEME.muted, fontSize: '14px', marginBottom: '6px' }}>
                    Avg Ticket
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800 }}>{formatTHB(avgTicket)}</div>
                </div>
              </div>

              <div style={{ padding: '0 20px 20px 20px' }}>
                {loadingSales ? (
                  <div style={{ paddingTop: '20px', color: THEME.muted }}>Loading sales...</div>
                ) : sales.length === 0 ? (
                  <div style={{ paddingTop: '20px', color: THEME.muted }}>No sales yet today.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '12px', paddingTop: '20px' }}>
                    {sales.map((sale) => (
                      <div
                        key={sale.id}
                        style={{
                          padding: '14px',
                          borderRadius: '14px',
                          background: THEME.soft,
                          border: `1px solid ${THEME.border}`,
                          display: 'grid',
                          gridTemplateColumns: '1fr auto auto',
                          gap: '16px',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>Receipt #{sale.id}</div>
                          <div style={{ color: THEME.muted, fontSize: '13px', marginTop: '4px' }}>
                            {formatReceiptTime(sale.created_at)}
                          </div>
                        </div>

                        <div style={{ color: THEME.muted }}>
                          {Array.isArray(sale.items)
                            ? `${sale.items.length} item${sale.items.length === 1 ? '' : 's'}`
                            : 'Sale'}
                        </div>

                        <div style={{ fontWeight: 800, color: THEME.khaki }}>
                          {formatTHB(sale.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${THEME.border}`,
              background: THEME.panel,
              borderRadius: '18px',
              padding: '20px',
              position: 'sticky',
              top: '24px',
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
                  marginBottom: '18px',
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
                    key={item.lineId}
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
                        onClick={() => removeItem(item.lineId)}
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
                        onClick={() => decreaseQty(item.lineId)}
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
                        onClick={() => increaseQty(item.lineId)}
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

                      <select
                        value={item.staff}
                        onChange={(e) => updateItemStaff(item.lineId, e.target.value)}
                        style={{
                          marginLeft: '8px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: `1px solid ${THEME.border}`,
                          background: THEME.panel,
                          color: THEME.text,
                          outline: 'none',
                        }}
                      >
                        {STAFF_OPTIONS.map((staffName) => (
                          <option key={staffName} value={staffName}>
                            {staffName}
                          </option>
                        ))}
                      </select>

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
                      onChange={(e) => updateItemNote(item.lineId, e.target.value)}
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
              <select
                value={defaultStaff}
                onChange={(e) => setDefaultStaff(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${THEME.border}`,
                  background: THEME.soft,
                  color: THEME.text,
                  outline: 'none',
                }}
              >
                {STAFF_OPTIONS.map((staffName) => (
                  <option key={staffName} value={staffName}>
                    Default Staff: {staffName}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="1"
                placeholder="Customers"
                value={customers}
                onChange={(e) => setCustomers(e.target.value)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.muted }}>Subtotal</span>
                <strong>{formatTHB(subtotal)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.muted }}>Service</span>
                <strong>{formatTHB(serviceCharge)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.muted }}>Discount</span>
                <strong>- {formatTHB(discount)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.muted }}>Customers</span>
                <strong>{customers || 1}</strong>
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

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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