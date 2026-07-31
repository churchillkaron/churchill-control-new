"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/shared/supabase/client";

const LOGIN_BRANDS = Object.freeze({
  avantiqo: "Avantiqo",
  churchill: "Churchill",
  butterfly: "Butterfly Bar",
  "butterfly-bar": "Butterfly Bar",
  cole