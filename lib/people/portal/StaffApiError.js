import { NextResponse } from "next/server";

function safeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : null;
}

function clientStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : null;
}

export function staffApiErrorResponse(error, fallbackMessage = "Unable to complete staff request") {
  const status = clientStatus(error?.status);
  const fallback = String(fallbackMessage || "Unable to complete staff request").trim().slice(0, 240);
  const message = status
    ? String(error?.message || fallback).trim().slice(0, 300) || fallback
    : fallback;

  return NextResponse.json(
    {
      success: false,
      error: message,
      code: status ? safeCode(error?.code) : null,
    },
    { status: status || 500 },
  );
}

export default staffApiErrorResponse;
