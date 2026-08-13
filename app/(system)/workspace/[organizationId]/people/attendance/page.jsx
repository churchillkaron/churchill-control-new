"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserX,
  XCircle,
} from "lucide-react";

const ATTENDANCE_CLASSIFICATIONS = [
  "ABSENT",
  "APPROVED_LEAVE",
  "SICK_LEAVE",
  "PUBLIC_HOLIDAY",
  "TRAINING",
];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

function requestedMonth()