"use client";

import { useMemo } from "react";
import CreateEngine from "./CreateEngine";
import {
  INTERCOMPANY_CREATE_FIELDS,
  INTERCOMPANY_RECONCILIATION_FIELDS,
  INTERCOMPANY_SETTLEMENT_FIELDS,
} from "@/lib/finance/intercompany/IntercompanyFormContract";

function formKind(action = {}, moduleKey = "") {
  const form = String(action.form || "").toLowerCase();
  const name = String(action.action || action.id || "").toLowerCase();
  if (form.includes("settlement") || name.includes("settle")) return "settlement";
  if (form.includes("reconciliation") || name.includes("reconcile")) return "reconciliation";
  if (form === "intercompany" || moduleKey === "intercompany") return "create";
  return null;
}

export function isIntercompanyEngineAction(action, moduleKey) {
  return Boolean(formKind(action, moduleKey));
}

export default function IntercompanyEngine(props) {
  const kind = formKind(props.action, props.moduleKey);
  const schema = useMemo(() => {
    if (kind === "settlement") return INTERCOMPANY_SETTLEMENT_FIELDS;
    if (kind === "reconciliation") return INTERCOMPANY_RECONCILIATION_FIELDS;
    return INTERCOMPANY_CREATE_FIELDS;
  }, [kind]);

  const values = {
    ...(props.values || {}),
    transaction_id:
      props.values?.transaction_id ||
      props.values?.id ||
      props.action?.row?.id ||
      null,
  };

  const action = {
    ...(props.action || {}),
    submitLabel:
      kind === "settlement"
        ? "Post Settlement"
        : kind === "reconciliation"
          ? "Reconcile"
          : "Post Intercompany Transaction",
  };

  return (
    <CreateEngine
      {...props}
      action={action}
      schema={schema}
      values={values}
      title={
        props.title ||
        (kind === "settlement"
          ? "Settle Intercompany Transaction"
          : kind === "reconciliation"
            ? "Reconcile Intercompany Transaction"
            : "New Intercompany Transaction")
      }
    />
  );
}
