import { NextResponse } from "next/server";

import signAction from "@/lib/trust/signatures/signAction";

import validateAuthority from "@/lib/trust/authority/validateAuthority";

import verifySignature from "@/lib/trust/verification/verifySignature";

import createTraceRecord from "@/lib/trust/traceability/createTraceRecord";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const signed =
      signAction({

        actor:
          body.actor || "SYSTEM",

        action_type:
          body.action_type,

        payload:
          body.payload || {},
      });

    const authority =
      await validateAuthority({

        actor:
          signed.actor,

        action_type:
          signed.action_type,

        risk_level:
          body.risk_level || "LOW",
      });

    const verification =
      verifySignature(
        signed
      );

    const trace =
      await createTraceRecord({

        tenant_id:
          body.tenant_id || "demo",

        actor:
          signed.actor,

        action_type:
          signed.action_type,

        signature:
          signed.signature,

        authority_result:
          authority,

        metadata: {

          signed,

          verification,
        },
      });

    return NextResponse.json({

      success: true,

      trust: {

        signed,

        authority,

        verification,

        trace,
      },
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
