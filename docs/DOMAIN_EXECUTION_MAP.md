# Domain Execution Map

## POS
Input:
- staff
- table
- order items

Output:
- order
- order_items
- kitchen ticket

Triggers:
- kitchen workflow
- production event after completion

---

## Kitchen
Input:
- active orders
- item status

Output:
- prepared order
- completed order event

Triggers:
- production engine

---

## Production
Input:
- completed order
- recipes
- ingredients

Output:
- inventory deduction
- production log
- cost calculation

Triggers:
- finance update
- stock alerts

---

## Inventory
Input:
- production deductions
- waste entries
- purchases

Output:
- stock levels
- alerts
- movement logs

---

## Finance
Input:
- revenue
- COGS
- expenses
- payroll

Output:
- profit
- cashflow
- reports

---

## Payroll
Input:
- attendance
- performance
- service charge
- approvals

Output:
- final payout
- deductions
- payroll report

---

## Marketing
Input:
- business profile
- assets
- campaign goals
- memory

Output:
- campaign
- generated image
- queue item
- publish log

---

## AI Layer
Input:
- operational data
- marketing data
- finance data

Output:
- recommendations
- alerts
- scores
- optimization suggestions

Rule:
AI recommends. Core systems execute.