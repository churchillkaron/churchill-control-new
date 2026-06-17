#!/bin/zsh

TENANT_ID="76e2caa6-dd78-49e5-b0f5-1ff94185c2d4"

# Customers to simulate
CUSTOMERS=(
  "Test Customer|0801234567|test@example.com"
  "Alice Smith|0812345678|alice@example.com"
  "Bob Johnson|0898765432|bob@example.com"
)

# Sample items for favoriteDish
DISHES=("Burger" "Pizza" "Salad" "Pasta" "Coffee" "Juice")

# Run 5 visits per customer
for c in ${CUSTOMERS[@]}; do
  IFS="|" read -r NAME PHONE EMAIL <<< "$c"
  for i in {1..5}; do
    # Random dish, drink, table
    DISH=${DISHES[$((RANDOM % ${#DISHES[@]}))]}
    DRINK=${DISHES[$((RANDOM % ${#DISHES[@]}))]}
    TABLE=$((RANDOM % 10 + 1))
    TOTAL=$(( (RANDOM % 2000) + 100 )) # total spent per visit
    VIP=$((RANDOM % 101)) # 0-100
    
    echo "Simulating visit $i for $NAME, spent ฿$TOTAL, VIP $VIP, favorite $DISH"

    curl -s -X POST "http://localhost:3000/api/customers/upsert-visit" \
      -H "Content-Type: application/json" \
      -d "{
        \"tenantId\": \"$TENANT_ID\",
        \"customerName\": \"$NAME\",
        \"customerPhone\": \"$PHONE\",
        \"customerEmail\": \"$EMAIL\",
        \"total\": $TOTAL,
        \"favoriteDish\": \"$DISH\",
        \"favoriteDrink\": \"$DRINK\",
        \"favoriteTable\": \"$TABLE\",
        \"vipScore\": $VIP
      }"
  done
done

echo "Simulation complete. Customer Portal should now have populated data."
