"use client";

import {
  getClientEngine,
} from "@/lib/platform/engines/ClientEngineRegistry";

function cleanTitle(label) {
  return String(label || "New")
    .replace(/^\+\s*/, "")
    .trim();
}

export default function CapabilityActionResolver({
  open,
  saving,
  action,
  fallbackLabel,
  schema,
  values,
  onChange,
  onClose,
  onSave,
  onPreview,
  organizationId,
  entityId,
  partyId,
  periodId,
  country,
  currency,
  moduleKey,
  onComplete,
}) {

  const resolvedAction = {

    id:
      action?.id ||
      action?.action ||
      "create",

    type:
      action?.type ||
      (
        action?.capability
          ? "capability"
          : "create"
      ),

    engine:
      action?.engine ||
      (
        action?.capability
          ? "create"
          : "create"
      ),

    title:
      action?.title ||
      action?.label ||
      cleanTitle(fallbackLabel),

    capability:
      action?.capability ||
      null,

    action:
      action?.action ||
      null,

    form:
      action?.form ||
      null,

    endpoint:
      action?.endpoint ||
      null,

    ...action,

  };


  if (resolvedAction.enabled === false) {
    return null;
  }


  const engineName =
    resolvedAction.engine ||
    (
      resolvedAction.type === "capability"
        ? "create"
        : resolvedAction.type
    ) ||
    "create";


  console.log(
    "ENGINE RESOLVE",
    {
      engineName,
      resolvedAction,
    }
  );

  const Engine =
    getClientEngine(engineName);


  if (!Engine) {

    console.warn(
      "No engine registered:",
      engineName,
      resolvedAction
    );

    return null;
  }


  console.log(
    "CAPABILITY ACTION OPEN",
    {
      open,
      engineName,
      Engine: Engine.name,
      action: resolvedAction,
    }
  );


  const context = {

    organizationId,

    entityId,

    partyId,

    periodId,

    country,

    currency,

    moduleKey,

  };


  console.log(
    "ENGINE LOADED",
    {
      engineName,
      Engine: !!Engine,
      open,
      action: resolvedAction,
    }
  );

  return (

    <Engine

      action={resolvedAction}

      context={context}

      organizationId={organizationId}

      entityId={entityId}

      periodId={periodId}

      country={country}

      currency={currency}

      moduleKey={moduleKey}

      open={open}

      saving={saving}

      title={
        resolvedAction.title ||
        cleanTitle(fallbackLabel)
      }

      schema={schema}

      values={values}

      onChange={onChange}

      onClose={onClose}

      onSave={
        resolvedAction.engine === "wallet_topup"
          ? undefined
          : onSave
      }

      onPreview={onPreview}

      onComplete={onComplete}

    />

  );
}
