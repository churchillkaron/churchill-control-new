"use client";

function first(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function money(value, currency, locale) {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat(locale || "en-GB", {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toLocaleString(locale || "en-GB", {
      maximumFractionDigits: 2,
    });
  }
}

export default function InvoiceRenderer({
  data = {},
  template = {},
  brand = {},
}) {
  const document = data.data || {};
  const party = data.party || document.party || {};
  const design = template?.template || template?.layout || {};
  const layout = design.layout || design;
  const options = design.options || {};
  const content = design.content || {};
  const blocks = layout.blocks || [
    "header",
    "invoice_info",
    "customer",
    "lines",
    "tax",
    "totals",
    "payment",
    "footer",
  ];
  const locale =
    template?.finance_template?.locale || design.locale || document.locale || "en-GB";
  const currency = first(
    document.currency_code,
    document.currency,
    data.currency_code,
    brand.currency_code,
    brand.currency
  );
  const lines = Array.isArray(document.lines) ? document.lines : [];
  const subtotal = first(
    document.totals?.subtotal,
    document.subtotal,
    lines.reduce(
      (sum, line) =>
        sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
      0
    )
  );
  const taxAmount = first(
    document.totals?.tax_amount,
    document.tax_amount,
    lines.reduce(
      (sum, line) => sum + Number(line.tax_amount || line.tax || 0),
      0
    )
  );
  const discountAmount = first(
    document.totals?.discount_amount,
    document.discount_amount,
    0
  );
  const totalAmount = first(
    document.totals?.total_amount,
    document.total_amount,
    Number(subtotal || 0) - Number(discountAmount || 0) + Number(taxAmount || 0)
  );
  const showLogo = options.show_logo !== false;
  const showTaxSummary = options.show_tax_summary !== false;
  const showPaymentDetails = options.show_payment_details !== false;

  function renderBlock(block) {
    if (block === "header") {
      return (
        <div key={block} className="flex justify-between gap-8">
          <div>
            {showLogo && brand.logo_url ? (
              <img
                src={brand.logo_url}
                alt="Logo"
                className="mb-4 h-16 max-w-56 object-contain object-left"
              />
            ) : null}
            <h1 className="text-3xl font-bold">
              {brand.name || brand.legal?.legal_name || "Organisation"}
            </h1>
            {brand.legal?.legal_name &&
            brand.legal.legal_name !== brand.name ? (
              <div className="mt-2 text-sm">{brand.legal.legal_name}</div>
            ) : null}
            {brand.legal?.tax_id ? (
              <div className="mt-1 text-sm">Tax ID: {brand.legal.tax_id}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">
              {document.document_label || document.title || "INVOICE"}
            </div>
            {template?.finance_template?.version ? (
              <div className="mt-2 text-xs text-gray-500">
                Template v{template.finance_template.version}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (block === "invoice_info") {
      return (
        <div
          key={block}
          className="mt-8 flex justify-end border-t border-gray-200 pt-6"
        >
          <div className="w-72 space-y-2 text-sm">
            {[
              ["Invoice No", first(document.invoice_number, document.number)],
              ["Invoice Date", first(document.invoice_date, document.document_date)],
              ["Due Date", document.due_date],
              ["Reference", first(document.reference, document.reference_number)],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-5">
                  <span>{label}:</span>
                  <span className="text-right font-semibold">{value}</span>
                </div>
              ))}
          </div>
        </div>
      );
    }

    if (block === "party" || block === "customer") {
      return (
        <div key={block} className="mt-10 border-t border-gray-200 pt-6">
          <div className="text-sm text-gray-500">Bill To</div>
          <div className="mt-2 text-xl font-semibold">
            {first(
              party.display_name,
              party.legal_name,
              document.customer_name,
              "Customer"
            )}
          </div>
          {first(party.address, document.customer_address) ? (
            <div className="mt-1 whitespace-pre-line text-sm">
              {first(party.address, document.customer_address)}
            </div>
          ) : null}
          {first(party.tax_id, document.customer_tax_id) ? (
            <div className="mt-1 text-sm">
              Tax ID: {first(party.tax_id, document.customer_tax_id)}
            </div>
          ) : null}
          {first(party.email, document.customer_email) ? (
            <div className="text-sm">
              {first(party.email, document.customer_email)}
            </div>
          ) : null}
          {first(party.phone, document.customer_phone) ? (
            <div className="text-sm">
              {first(party.phone, document.customer_phone)}
            </div>
          ) : null}
        </div>
      );
    }

    if (block === "lines") {
      return (
        <table key={block} className="mt-10 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-3 text-left">Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit Price</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const lineTotal = first(
                line.total,
                line.line_total,
                Number(line.quantity || 0) * Number(line.unit_price || 0)
              );

              return (
                <tr key={line.id || index} className="border-b border-gray-200">
                  <td className="py-3 pr-5">
                    <div>{line.description || line.name || `Line ${index + 1}`}</div>
                    {line.details ? (
                      <div className="mt-1 text-xs text-gray-500">{line.details}</div>
                    ) : null}
                  </td>
                  <td className="text-right">{line.quantity ?? "—"}</td>
                  <td className="text-right">
                    {money(line.unit_price, currency, locale)}
                  </td>
                  <td className="text-right font-medium">
                    {money(lineTotal, currency, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }

    if (block === "tax") {
      if (!showTaxSummary || !Number(taxAmount || 0)) return null;

      return (
        <div key={block} className="mt-5 flex justify-end text-sm">
          <div className="flex w-72 justify-between gap-5">
            <span>{document.tax_label || "Tax"}</span>
            <span>{money(taxAmount, currency, locale)}</span>
          </div>
        </div>
      );
    }

    if (block === "totals") {
      return (
        <div key={block} className="mt-6 flex justify-end">
          <div className="w-72 space-y-2 text-right">
            <div className="flex justify-between gap-5 text-sm">
              <span>Subtotal</span>
              <span>{money(subtotal, currency, locale)}</span>
            </div>
            {Number(discountAmount || 0) ? (
              <div className="flex justify-between gap-5 text-sm">
                <span>Discount</span>
                <span>-{money(discountAmount, currency, locale)}</span>
              </div>
            ) : null}
            {showTaxSummary && Number(taxAmount || 0) ? (
              <div className="flex justify-between gap-5 text-sm">
                <span>{document.tax_label || "Tax"}</span>
                <span>{money(taxAmount, currency, locale)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-5 border-t border-gray-300 pt-3 text-2xl font-bold">
              <span>Total</span>
              <span>{money(totalAmount, currency, locale)}</span>
            </div>
          </div>
        </div>
      );
    }

    if (block === "payment") {
      if (!showPaymentDetails) return null;

      const paymentNote = first(
        content.payment_note,
        document.payment_instructions,
        document.payment_terms,
        brand.payment?.instructions
      );
      const payment = brand.payment || {};
      const hasPaymentData =
        paymentNote ||
        payment.bank_name ||
        payment.account_name ||
        payment.account_number ||
        payment.iban ||
        payment.swift;

      if (!hasPaymentData) return null;

      return (
        <div key={block} className="mt-8 border-t border-gray-200 pt-5 text-sm">
          <div className="font-semibold">Payment Details</div>
          {paymentNote ? (
            <div className="mt-2 whitespace-pre-line">{paymentNote}</div>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-1 md:grid-cols-2">
            {payment.bank_name ? <div>Bank: {payment.bank_name}</div> : null}
            {payment.account_name ? (
              <div>Account Name: {payment.account_name}</div>
            ) : null}
            {payment.account_number ? (
              <div>Account No: {payment.account_number}</div>
            ) : null}
            {payment.iban ? <div>IBAN: {payment.iban}</div> : null}
            {payment.swift ? <div>SWIFT: {payment.swift}</div> : null}
          </div>
        </div>
      );
    }

    if (block === "footer") {
      return (
        <div
          key={block}
          className="mt-12 grid gap-6 border-t border-gray-200 pt-5 text-xs text-gray-500 md:grid-cols-2"
        >
          <div>
            {brand.legal?.address ? (
              <div className="whitespace-pre-line">{brand.legal.address}</div>
            ) : null}
            {brand.legal?.email ? <div>{brand.legal.email}</div> : null}
            {brand.website ? <div>{brand.website}</div> : null}
          </div>
          <div className="md:text-right">
            {content.legal_note ? (
              <div className="whitespace-pre-line">{content.legal_note}</div>
            ) : null}
            {content.footer_note ? (
              <div className="mt-2 whitespace-pre-line">{content.footer_note}</div>
            ) : null}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="rounded-3xl bg-white p-10 text-black">
      {blocks.map(renderBlock)}
    </div>
  );
}
