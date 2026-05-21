import crypto from "crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAuditBlockchainLedger({
  tenant_id,
}) {

  try {

    const {
      data: logs,
      error,
    } = await supabaseAdmin
      .from("audit_logs")
      .select(`
        id,
        entity_type,
        entity_id,
        action_type,
        performed_by,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      )
      .limit(5000);

    if (error) {
      throw error;
    }

    const blockchain = [];

    let previousHash =
      "GENESIS_BLOCK";

    for (const log of logs || []) {

      const payload =
        JSON.stringify({

          id:
            log.id,

          entity_type:
            log.entity_type,

          entity_id:
            log.entity_id,

          action_type:
            log.action_type,

          performed_by:
            log.performed_by,

          created_at:
            log.created_at,

          previousHash,
        });

      const hash =
        crypto
          .createHash("sha256")
          .update(payload)
          .digest("hex");

      blockchain.push({

        block_id:
          log.id,

        entity_type:
          log.entity_type,

        action_type:
          log.action_type,

        created_at:
          log.created_at,

        previous_hash:
          previousHash,

        hash,
      });

      previousHash =
        hash;
    }

    return {

      success: true,

      total_blocks:
        blockchain.length,

      latest_hash:
        previousHash,

      blockchain:
        blockchain.slice(-100),

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
