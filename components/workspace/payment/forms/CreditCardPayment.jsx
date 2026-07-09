"use client";

export default function CreditCardPayment({
  value = {},
  onChange,
}) {

  return (

    <div className="space-y-4">

      <input
        placeholder="Card Number"
        value={value.card_number || ""}
        onChange={e =>
          onChange({
            ...value,
            card_number:e.target.value,
          })
        }
        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
      />

      <div className="grid grid-cols-2 gap-4">

        <input
          placeholder="MM / YY"
          value={value.expiry || ""}
          onChange={e =>
            onChange({
              ...value,
              expiry:e.target.value,
            })
          }
          className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
        />

        <input
          placeholder="CVC"
          value={value.cvc || ""}
          onChange={e =>
            onChange({
              ...value,
              cvc:e.target.value,
            })
          }
          className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
        />

      </div>


      <input
        placeholder="Card Holder"
        value={value.card_holder || ""}
        onChange={e =>
          onChange({
            ...value,
            card_holder:e.target.value,
          })
        }
        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
      />

    </div>

  );

}
