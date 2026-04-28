'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ManagementPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const res = await fetch('/api/dashboard/today')
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    }
  }

  if (!data) {
    return <div className="p-6 text-white bg-black min-h-screen">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-black text-white flex">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white/5 border-r border-white/10 p-4 space-y-2">
        <h2 className="text-xl font-bold mb-4">Management</h2>

        <Nav href="/management/dashboard" label="Dashboard" />
        <Nav href="/management/approval" label="Approval" />
        <Nav href="/management/attendance" label="Attendance" />
        <Nav href="/management/invoices" label="Invoices" />
        <Nav href="/management/messages" label="Messages" />
        <Nav href="/management/salary" label="Salary" />
        <Nav href="/management/staff-control" label="Staff Control" />
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 space-y-6">

        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-bold">Manager Control Panel</h1>
          <p className="text-sm opacity-60">Live system state</p>
        </div>

        {/* CORE METRICS */}
        <div className="grid grid-cols-4 gap-4">
          <Card title="Revenue" value={`฿${data.revenue}`} />
          <Card title="Orders" value={data.orders} />
          <Card title="Avg Order" value={`฿${data.avgOrder}`} />
          <Card title="Service Charge" value={`฿${data.serviceCharge}`} />
        </div>

        {/* PERFORMANCE */}
        <div className="grid grid-cols-3 gap-4">
          <Card title="FOH Score" value={`${data.fohScore}%`} />
          <Card title="Kitchen Level" value={data.kitchenLevel} />
          <Card title="Bar Level" value={data.barLevel} />
        </div>

        {/* FINANCE */}
        <div className="grid grid-cols-3 gap-4">
          <Card title="COGS" value={`฿${data.cogs}`} />
          <Card title="Profit" value={`฿${data.profit}`} />
          <Card title="Cost %" value={`${data.costPercent}%`} />
        </div>

        {/* ALERTS */}
        <Section title="Alerts">
          {data.alerts?.length === 0 && <Empty />}
          {data.alerts?.map((a, i) => (
            <Alert key={i} type={a.type} message={a.message} />
          ))}
        </Section>

        {/* TASKS */}
        <Section title="Tasks">
          {data.tasks?.length === 0 && <Empty />}
          {data.tasks?.map((t, i) => (
            <Task key={i} title={t.title} />
          ))}
        </Section>

        {/* STOCK */}
        <Section title="Low Stock">
          {data.stock?.length === 0 && <Empty />}
          {data.stock?.map((s, i) => (
            <Stock key={i} item={s.item} level={s.level} qty={s.qty} />
          ))}
        </Section>

        {/* TOP STAFF */}
        <Section title="Staff Performance">
          {data.staff?.map((s, i) => (
            <Staff key={i} name={s.name} score={s.score} />
          ))}
        </Section>

      </main>
    </div>
  )
}

/* COMPONENTS */

function Nav({ href, label }) {
  return (
    <Link href={href} className="block px-3 py-2 rounded hover:bg-white/10">
      {label}
    </Link>
  )
}

function Card({ title, value }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <p className="text-sm opacity-60">{title}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Alert({ type, message }) {
  const color =
    type === 'critical'
      ? 'bg-red-900/40'
      : type === 'warning'
      ? 'bg-yellow-900/40'
      : 'bg-blue-900/40'

  return <div className={`p-3 rounded ${color}`}>{message}</div>
}

function Task({ title }) {
  return <div className="p-3 bg-blue-900/40 rounded">{title}</div>
}

function Stock({ item, level, qty }) {
  return (
    <div className="p-3 bg-white/5 rounded border border-white/10 flex justify-between">
      <span>{item}</span>
      <span className="opacity-70">{qty} ({level})</span>
    </div>
  )
}

function Staff({ name, score }) {
  return (
    <div className="p-3 bg-white/5 rounded flex justify-between">
      <span>{name}</span>
      <span>{score}%</span>
    </div>
  )
}

function Empty() {
  return <p className="opacity-50 text-sm">Nothing here</p>
}