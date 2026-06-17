#!/bin/zsh

TENANT_ID="76e2caa6-dd78-49e5-b0f5-1ff94185c2d4"
CUSTOMER_NAME="Test Customer"
CUSTOMER_PHONE="0801234567"
CUSTOMER_EMAIL="test@example.com"

# Sample items
ITEMS=(
  "Burger"
  "Pizza"
  "Salad"
  "Pasta"
  "Coffee"
  "Juice"
)

# Simulate 10 payments
for i in {1..10}; do
  # Pick 1-3 random items
  ORDER_ITEMS=()
  COUNT=$((RANDOM % 3 + 1))
  for j in $(seq 1 $COUNT); do
    INDEX=$((RANDOM % ${#ITEMS[@]}))
    ITEM_NAME=${ITEMS[$INDEX]}
    QUANTITY=$((RANDOM % 3 + 1))
    ORDER_ITEMS+=("{\"item_name\":\"$ITEM_NAME\",\"quantity\":$QUANTITY}")
  done

  ORDER_TOTAL=0
  for it in ${(s:,:)ORDER_ITEMS}; do
    PRICE=$(( (RANDOM % 500) + 100 )) # Random price 100-600 THB
    ORDER_TOTAL=$((ORDER_TOTAL + PRICE))
  done

  PAYLOAD=$(cat <<PAYLOAD
{
  "tenantId":"$TENANT_ID",
  "tableNumber":"SIM-$i",
  "paymentMethod":"CASH",
  "cashierName":"SYSTEM",
  "paidAmount":$ORDER_TOTAL,
  "items":[${(j:,,:)ORDER_ITEMS}],
  "customer_name":"$CUSTOMER_NAME",
  "customer_phone":"$CUSTOMER_PHONE",
  "customer_email":"$CUSTOMER_EMAIL"
}
PAYLOAD
)

  echo "Simulating payment $i / 10..."
  curl -s -X POST "http://localhost:3000/api/pos/markOrderPaid" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" > /dev/null
done

echo "Simulation complete. Customer dashboard should now show populated metrics."
