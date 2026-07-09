"use client";

import {
  useEffect,
  useState,
} from "react";


import CreditCardPayment from "@/components/workspace/payment/forms/CreditCardPayment";
import QRPayment from "@/components/workspace/payment/forms/QRPayment";
import BankTransferPayment from "@/components/workspace/payment/forms/BankTransferPayment";


const DEFAULT_PAYMENT_METHODS = [
  {
    id: "credit_card",
    name: "Credit Card",
    type: "card",
  },
  {
    id: "bank_transfer",
    name: "Bank Transfer",
    type: "bank",
  },
  {
    id: "qr_payment",
    name: "QR Payment",
    type: "qr",
  },
];

const SUPPORTED_PAYMENT_METHOD_IDS =
  new Set(
    DEFAULT_PAYMENT_METHODS.map(
      method => method.id
    )
  );


function cleanValue(value) {
  const normalized =
    String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return "";
  }

  return normalized;
}


export default function WalletTopUpEngine({
  open,
  title = "Top Up Wallet",
  onClose,
  onSave,
  onComplete,
  context = {},
  saving = false,
}) {

  const [amount,setAmount] =
    useState("");

  const [currency,setCurrency] =
    useState(
      cleanValue(context.currency)
    );


  const [paymentMethod,setPaymentMethod] =
    useState("");


  const [paymentMethods,setPaymentMethods] =
    useState([]);


  const [paymentData,setPaymentData] =
    useState({});


  const [notes,setNotes] =
    useState("");


  useEffect(()=>{

    const contextCurrency =
      cleanValue(context.currency);

    if (contextCurrency) {
      setCurrency(contextCurrency);
    }

  },[
    context.currency,
  ]);


  useEffect(()=>{

    let active =
      true;

    const entityId =
      cleanValue(context.entityId);

    const contextCurrency =
      cleanValue(context.currency);

    console.log(
      "WALLET CURRENCY CONTEXT",
      {
        entityId,
        organizationId: cleanValue(context.organizationId),
        currency: contextCurrency,
      }
    );

    async function loadCurrency(){

      if(!entityId){
        return;
      }


      const response =
        await fetch(
          `/api/platform/currency/entity?entity_id=${encodeURIComponent(entityId)}`
        );


      const result =
        await response.json();


      if(
        active &&
        result.success
      ){

        setCurrency(
          cleanValue(result.currency) ||
          contextCurrency ||
          ""
        );

      }

    }


    if(open){

      loadCurrency();

    }


    return () => {
      active = false;
    };

  },[
    open,
    context.entityId,
    context.currency,
  ]);


  useEffect(()=>{

    let active =
      true;

    async function loadPaymentMethods(){

      const organizationId =
        cleanValue(context.organizationId);

      const resolvedCurrency =
        cleanValue(currency);

      if (
        !organizationId
      ) {
        setPaymentMethods([]);
        setPaymentMethod("");
        return;
      }

      const params =
        new URLSearchParams({
          organization_id: organizationId,
          country: cleanValue(context.country),
        });

      if (resolvedCurrency) {
        params.set(
          "currency",
          resolvedCurrency
        );
      }

      const response =
        await fetch(
          `/api/platform/payment-methods?${params.toString()}`
        );


      let result =
        await response.json();


      if (
        resolvedCurrency &&
        !result.methods?.length
      ) {
        params.delete("currency");

        const fallbackResponse =
          await fetch(
            `/api/platform/payment-methods?${params.toString()}`
          );

        result =
          await fallbackResponse.json();
      }


      if (!active) {
        return;
      }

      const returnedMethods =
        result.methods?.length
          ? result.methods
          : DEFAULT_PAYMENT_METHODS;

      const methods =
        returnedMethods.filter(method =>
          SUPPORTED_PAYMENT_METHOD_IDS.has(method.id)
        );

      setPaymentMethods(methods);


      if (methods.length){

        setPaymentMethod(
          current =>
            methods.some(
              method => method.id === current
            )
              ? current
              : methods[0].id
        );

      } else {

        setPaymentMethod("");

      }

    }


    if(open){

      loadPaymentMethods();

    }

    return () => {
      active = false;
    };

  },[
    open,
    context.organizationId,
    context.country,
    currency,
  ]);


  if(!open)
    return null;



  function renderPaymentForm(){

    console.log(
      "PAYMENT FORM DEBUG",
      {
        paymentMethod,
        paymentMethods,
      }
    );

    if (
      !currency ||
      !paymentMethod ||
      !paymentMethods.length
    ) {
      return null;
    }


    if(
      paymentMethod === "credit_card"
    ){

      return (
        <CreditCardPayment
          value={paymentData}
          onChange={setPaymentData}
        />
      );

    }


    if(
      paymentMethod === "qr_payment"
    ){

      return (
        <QRPayment />
      );

    }


    if(
      paymentMethod === "bank_transfer"
    ){

      return (
        <BankTransferPayment />
      );

    }


    return null;

  }



  async function submit(){

    const organizationId =
      cleanValue(context.organizationId);

    const entityId =
      cleanValue(context.entityId);

    const resolvedCurrency =
      cleanValue(currency);

    if (!organizationId) {
      alert("Organization is still loading.");
      return;
    }

    if (!resolvedCurrency) {
      alert("Currency is still loading.");
      return;
    }

    if (!paymentMethod) {
      alert("Payment method is still loading.");
      return;
    }

    const response =
      await fetch(
        "/api/platform/payment/create",
        {
          method:"POST",

          headers:{
            "Content-Type":"application/json",
          },

          body:JSON.stringify({

            organization_id:
              organizationId,

            entity_id:
              entityId || null,

            party_id:
              context.partyId,

            country:
              context.country,

            amount:
              Number(amount || 0),

            currency:
              resolvedCurrency,

            payment_method:
              paymentMethod,

            metadata:{

              payment_data:
                paymentData,

              notes,

            },

          }),

        }
      );


    const result =
      await response.json();


    if(!result.success){

      alert(
        result.error ||
        "Payment creation failed"
      );

      return;

    }


    alert(
      "Payment created: " +
      result.payment.id
    );

    if (onComplete) {
      onComplete();
    }

    if (onClose) {
      onClose();
    }


  }



  return (

    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">

      <div className="w-full max-w-xl rounded-[30px] border border-white/10 bg-[#0b0b0b] p-8 text-white">


        <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
          Wallet Action
        </div>


        <h2 className="mt-3 text-3xl font-light">
          {title}
        </h2>


        <div className="mt-8 space-y-5">


          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={
              e=>setAmount(e.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
          />


          <div className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white/70">
            Currency: {currency || "Loading..."}
          </div>


          <div className="grid grid-cols-3 gap-2">

            {paymentMethods.map(method=>(

              <button
                key={method.id}
                type="button"
                onClick={() =>
                  setPaymentMethod(method.id)
                }
                className={
                  [
                    "min-h-12 rounded-xl border px-3 py-2 text-sm transition",
                    paymentMethod === method.id
                      ? "border-amber-300 bg-amber-300 text-black"
                      : "border-white/10 bg-black/20 text-white/70 hover:border-white/25 hover:bg-white/10",
                  ].join(" ")
                }
              >
                {method.name}
              </button>

            ))}

          </div>


          {renderPaymentForm()}


          <textarea
            placeholder="Notes"
            value={notes}
            onChange={
              e=>setNotes(e.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
          />


        </div>


        <div className="mt-8 flex justify-end gap-3">

          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-3"
          >
            Cancel
          </button>


          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-amber-400 px-5 py-3 text-black font-semibold"
          >
            Confirm Top Up
          </button>

        </div>


      </div>

    </div>

  );

}
