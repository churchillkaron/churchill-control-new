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


  function handleSubmit(){

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
      payment_data: paymentData,
      notes,
    };

    if(onSave){
      onSave(payload);
      return;
    }

    onComplete?.(payload);
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
