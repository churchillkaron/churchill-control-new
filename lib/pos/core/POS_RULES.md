# POS ARCHITECTURE RULES

1. All POS UI must use POSStateEngine
2. No direct supabase.from() in POS pages
3. No duplicate fetch logic
4. Realtime must only patch state, never reload full dataset
5. Kitchen/Bar read from order_items only via engine state
