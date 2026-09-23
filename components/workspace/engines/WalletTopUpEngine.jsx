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

  const [paymentAction,setPaymentAction] =
    useState(null);


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

    const organizationId =
      cleanValue(context.organizationId);

    const contextCurrency =
      cleanValue(context.currency);

    async function loadCurrency(){

      if(!entityId || !organizationId){
        return;
      }

      const params = new URLSearchParams({
        entity_id: entityId,
        organization_id: organizationId,
      });

      const response =
        await fetch(
          `/api/platform/currency/entity?${params.toString()}`
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
    context.organizationId,
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


      if (!response.ok) {
        result = {
          success: false,
          paymentMethods: [],
        };
      }


      const configuredMethods =
        Array.isArray(result.paymentMethods)
          ? result.paymentMethods
          : [];


      const nextMethods =
        configuredMethods
          .filter(method =>
            SUPPORTED_PAYMENT_METHOD_IDS.has(
              cleanValue(
                method.id ||
                method.payment_method
              )
            )
          )
          .map(method => {
            const id = cleanValue(
              method.id ||
              method.payment_method
            );
            const fallback =
              DEFAULT_PAYMENT_METHODS.find(
                item => item.id === id
              );

            return {
              ...fallback,
              ...method,
              id,
              name:
                cleanValue(method.name) ||
                fallback?.name ||
                id,
              type:
                cleanValue(method.type) ||
                fallback?.type ||
                id,
            };
          });


      if(active){

        setPaymentMethods(nextMethods);

        setPaymentMethod(current =>
          nextMethods.some(
            method => method.id === current
          )
            ? current
            : nextMethods[0]?.id || ""
        );

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


  async function handleSubmit(){
    try {
    const normalizedAmount =
      Number(amount);

    const normalizedCurrency =
      cleanValue(currency);

    if(
      !Number.isFinite(normalizedAmount) ||
      normalizedAmount <= 0
    ){
      alert("Enter a valid amount.");
      return;
    }

    if(!normalizedCurrency){
      alert("Currency could not be resolved for this entity.");
      return;
    }

    if(!paymentMethod){
      alert("Choose a payment method.");
      return;
    }

    const payload = {
      amount: normalizedAmount,
      currency: normalizedCurrency,
      payment_method: paymentMethod,
      notes,
    };

    if(onSave){
      await onSave(payload);
      return;
    }

    const organizationId =
      cleanValue(context.organizationId);

    if(!organizationId){
      alert("Organization context is required.");
      return;
    }

    const response = await fetch("/api/platform/payment/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organization_id: organizationId,
        entity_id: cleanValue(context.entityId) || null,
        party_id: cleanValue(context.partyId) || null,
        country: cleanValue(context.country) || null,
        amount: normalizedAmount,
        currency: normalizedCurrency,
        payment_method: paymentMethod,
        metadata: {
          source: "wallet_topup",
          notes: cleanValue(notes) || null,
          description: "Avantiqo wallet top up",
        },
      }),
    });

    const result = await response.json().catch(() => ({}));

    if(!response.ok || result.success !== true){
      throw new Error(result.error || "Payment creation failed");
    }

    if(result.action?.type === "redirect" && result.action?.url){
      window.location.assign(result.action.url);
      return;
    }

    setPaymentAction(result.action || null);

    onComplete?.({
      ...payload,
      payment: result.payment,
      action: result.action,
    });
    } catch (error) {
      console.error("WALLET_TOPUP_PAYMENT_ERROR", error);
      alert(error?.message || "Payment could not be started.");
    }
  }


  if(!open){
    return null;
  }


  const selectedMethod =
    paymentMethods.find(
      method => method.id === paymentMethod
    );


  return (
    <div className="workspace-modal-overlay">
      <div className="workspace-modal">
        <div className="workspace-modal-header">
          <div>
            <div className="workspace-modal-eyebrow">Wallet</div>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="workspace-modal-close"
          >
            ×
          </button>
        </div>

        <div className="workspace-modal-body">
          <label>
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
          </label>

          <label>
            Currency
            <input
              value={currency}
              readOnly
            />
          </label>

          <label>
            Payment Method
            <select
              value={paymentMethod}
              onChange={event => {
                setPaymentMethod(event.target.value);
                setPaymentData({});
                setPaymentAction(null);
              }}
            >
              {paymentMethods.length === 0 ? (
                <option value="">No configured payment method</option>
              ) : null}
              {paymentMethods.map(method => (
                <option
                  key={method.id}
                  value={method.id}
                >
                  {method.name}
                </option>
              ))}
            </select>
          </label>

          {selectedMethod?.type === "card" ? (
            <CreditCardPayment
              value={paymentData}
              onChange={setPaymentData}
            />
          ) : null}

          {selectedMethod?.type === "qr" ? (
            <QRPayment
              value={paymentData}
              onChange={setPaymentData}
            />
          ) : null}

          {selectedMethod?.type === "bank" ? (
            <BankTransferPayment
              value={paymentData}
              onChange={setPaymentData}
            />
          ) : null}

          {paymentAction?.type === "bank_transfer" ? (
            <div className="rounded-2xl border border-black/[0.08] bg-[#FCFBF9] p-4 text-[#28231E]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">
                Awaiting bank settlement
              </div>
              <div className="mt-3 grid gap-2 text-[11px]">
                <div><span className="text-[#827A71]">Bank</span><div className="font-medium">{paymentAction.instructions?.bank_name}</div></div>
                <div><span className="text-[#827A71]">Account name</span><div className="font-medium">{paymentAction.instructions?.account_name}</div></div>
                <div><span className="text-[#827A71]">Account number</span><div className="font-medium tabular-nums">{paymentAction.instructions?.account_number}</div></div>
                <div><span className="text-[#827A71]">Amount</span><div className="font-medium tabular-nums">{paymentAction.amount} {paymentAction.currency}</div></div>
                <div><span className="text-[#827A71]">Reference</span><div className="font-medium break-all">{paymentAction.reference}</div></div>
              </div>
              <div className="mt-3 text-[10px] leading-4 text-[#827A71]">
                Avantiqo will mark this payment complete only after Finance verifies the incoming bank transaction.
              </div>
            </div>
          ) : null}

          {paymentAction?.type === "qr_payment" ? (
            <div className="rounded-2xl border border-black/[0.08] bg-[#FCFBF9] p-4 text-[#28231E]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">
                PromptPay payment created
              </div>
              <div className="mt-2 text-[11px]">
                {paymentAction.amount} {paymentAction.currency} · reference {paymentAction.reference}
              </div>
              <div className="mt-2 text-[10px] leading-4 text-[#827A71]">
                Settlement remains pending until bank evidence verifies the incoming QR payment.
              </div>
            </div>
          ) : null}

          <label>
            Notes
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
            />
          </label>
        </div>

        <div className="workspace-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="workspace-button-secondary"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || paymentMethods.length === 0}
            className="workspace-button-primary"
          >
            {saving ? "Processing..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
