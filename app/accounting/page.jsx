'use client'

import { useState } from 'react'

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

const STAFF_OPTIONS = ['John', 'Anna', 'Mike']

const EXPENSE_CATEGORIES = [
  'Beverage Purchase',
  'Food Purchase',
  'Ice',
  'Gas',
  'Cleaning',
  'Office / Small Supplies',
  'Emergency Purchase',
  'Maintenance',
  'Other',
]

const EXPENSE_DEPARTMENTS = [
  'Bar',
  'Kitchen',
  'Floor / Service',
  'Admin',
  'Cleaning',
  'Maintenance',
  'General',
]

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function AccountingPage() {
  const [expenseStaff, setExpenseStaff] = useState(STAFF_OPTIONS[0])
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0])
  const [expenseDepartment, setExpenseDepartment] = useState('General')
  const [expenseNote, setExpenseNote] = useState('')
  const [expenseFile, setExpenseFile] = useState(null)
  const [expensePreview, setExpensePreview] = useState('')
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [expenseError, setExpenseError] = useState('')
  const [expenseSuccess, setExpenseSuccess] = useState('')

  const resetExpense = () => {
    setExpenseStaff(STAFF_OPTIONS[0])
    setExpenseAmount('')
    setExpenseCategory(EXPENSE_CATEGORIES[0])
    setExpenseDepartment('General')
    setExpenseNote('')
    setExpenseFile(null)
    setExpensePreview('')
    setExpenseError('')
    setExpenseSuccess('')
  }

  const saveExpense = async () => {
    setExpenseError('')
    setExpenseSuccess('')

    if (!expenseFile) {
      setExpenseError('Upload a receipt photo first.')
      return
    }

    if (Number(expenseAmount || 0) <= 0) {
      setExpenseError('Amount must be greater than 0.')
      return
    }

    try {
      setExpenseSaving(true)

      const imageDataUrl = await fileToDataUrl(expenseFile)

      const response = await fetch('/api/accounting-expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Number(expenseAmount || 0),
          category: expenseCategory,
          department: expenseDepartment,
          note: expenseNote,
          staff: expenseStaff,
          receipt_image: imageDataUrl,
          receipt_name: expenseFile.name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save expense.')
      }

      setExpenseSuccess('Expense saved successfully.')
      resetExpense()
    } catch (error) {
      setExpenseError(error.message || 'Failed to save expense.')
    } finally {
      setExpenseSaving(false)
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
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div
          style={{
            border: `1px solid ${THEME.border}`,
            background: THEME.panel,
            borderRadius: '18px',
            padding: '20px',
            marginBottom: '20px',
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
              Churchill Karon Accounting
            </div>
            <div
              style={{
                color: THEME.muted,
                marginTop: '6px',
                fontSize: '14px',
              }}
            >
              Expense upload with receipt proof
            </div>
          </div>
        </div>

        {expenseError && (
          <div
            style={{
              marginBottom: '14px',
              border: `1px solid ${THEME.red}`,
              background: '#2a1111',
              borderRadius: '14px',
              padding: '12px',
              color: '#f5d0d0',
              fontWeight: 700,
            }}
          >
            {expenseError}
          </div>
        )}

        {expenseSuccess && (
          <div
            style={{
              marginBottom: '14px',
              border: `1px solid ${THEME.green}`,
              background: '#0f1f15',
              borderRadius: '14px',
              padding: '12px',
              color: THEME.khaki,
              fontWeight: 700,
            }}
          >
            {expenseSuccess}
          </div>
        )}

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
            Expense Upload
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <select
              value={expenseStaff}
              onChange={(e) => setExpenseStaff(e.target.value)}
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
                  Staff: {staffName}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Amount"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
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

            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
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
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  Category: {category}
                </option>
              ))}
            </select>

            <select
              value={expenseDepartment}
              onChange={(e) => setExpenseDepartment(e.target.value)}
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
              {EXPENSE_DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  Department: {department}
                </option>
              ))}
            </select>

            <textarea
              placeholder="Expense note..."
              value={expenseNote}
              onChange={(e) => setExpenseNote(e.target.value)}
              rows={4}
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
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0] ? e.target.files[0] : null
                setExpenseFile(file)
                setExpenseSuccess('')
                setExpenseError('')

                if (file) {
                  const previewUrl = URL.createObjectURL(file)
                  setExpensePreview(previewUrl)
                } else {
                  setExpensePreview('')
                }
              }}
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

            {expensePreview && (
              <div
                style={{
                  border: `1px solid ${THEME.border}`,
                  borderRadius: '14px',
                  overflow: 'hidden',
                  background: THEME.soft,
                  padding: '10px',
                }}
              >
                <img
                  src={expensePreview}
                  alt="Expense receipt preview"
                  style={{
                    width: '100%',
                    maxHeight: '420px',
                    objectFit: 'contain',
                    borderRadius: '10px',
                  }}
                />
              </div>
            )}

            <button
              onClick={saveExpense}
              disabled={expenseSaving}
              style={{
                padding: '14px',
                borderRadius: '14px',
                border: 'none',
                background: THEME.orange,
                color: '#111111',
                fontWeight: 800,
                cursor: expenseSaving ? 'not-allowed' : 'pointer',
                opacity: expenseSaving ? 0.7 : 1,
              }}
            >
              {expenseSaving ? 'Saving Expense...' : 'Save Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}