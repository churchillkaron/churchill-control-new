import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";


function formatDate(value, timeZone = "UTC") {

  if (!value) {
    return null;
  }


  try {

    return new Intl.DateTimeFormat(
      "en-GB",
      {
        dateStyle:"medium",
        timeStyle:"short",
        timeZone,
      }
    ).format(
      new Date(value)
    );

  } catch {

    return value;

  }

}


export async function resolveDetailReadModel({

  row,

}) {

  if (!row) {
    return null;
  }


  const enriched = {
    ...row,
  };


  /*
    Journal Entry detail
  */

  if (
    row.journal_number &&
    Array.isArray(row.lines)
  ) {

    enriched["Journal Lines"] =
      row.lines.map(
        line => ({
          account:
            line.account?.code +
            " " +
            line.account?.name,

          debit:
            line.debit || 0,

          credit:
            line.credit || 0,
        })
      );

    delete enriched.lines;

  }


  /*
    Staff names
  */

  const staffIds =
    [
      row.assigned_to,
      row.created_by,
      row.started_by,
      row.completed_by,
    ]
    .filter(Boolean);


  if (staffIds.length) {

    const {
      data: staff,
    } =
      await supabaseAdmin
        .from("staff_accounts")
        .select(
          "id,party_id"
        )
        .in(
          "id",
          staffIds
        );


    const partyIds =
      (staff || [])
        .map(
          item => item.party_id
        )
        .filter(Boolean);


    const {
      data: parties,
    } =
      partyIds.length
        ? await supabaseAdmin
            .from("parties")
            .select(
              "id,display_name"
            )
            .in(
              "id",
              partyIds
            )
        : {
            data:[]
          };


    const partyMap =
      Object.fromEntries(
        (parties || [])
          .map(
            party => [
              party.id,
              party.display_name,
            ]
          )
      );


    const staffMap =
      Object.fromEntries(
        (staff || [])
          .map(
            item => [
              item.id,
              partyMap[item.party_id] ||
              item.id,
            ]
          )
      );


    if (row.assigned_to) {

      enriched["Assigned To"] =
        staffMap[row.assigned_to];

    }


    if (row.created_by) {

      enriched["Created By"] =
        staffMap[row.created_by];

    }


    if (row.started_by) {

      enriched["Started By"] =
        staffMap[row.started_by];

    }


    if (row.completed_by) {

      enriched["Completed By"] =
        staffMap[row.completed_by];

    }

  }


  /*
    Remove raw ids from display
  */

  delete enriched.assigned_to;
  delete enriched.created_by;
  delete enriched.started_by;
  delete enriched.completed_by;


  /*
    Dates
  */

  enriched["Created At"] =
    formatDate(
      row.created_at
    );


  enriched["Updated At"] =
    formatDate(
      row.updated_at
    );


  enriched["Started At"] =
    formatDate(
      row.started_at
    );


  enriched["Completed At"] =
    formatDate(
      row.completed_at
    );


  /*
    Organization name
  */


  if (row.organization_id) {

    const {
      data: organization,
    } =
      await supabaseAdmin
        .from("organizations")
        .select(
          "id,name"
        )
        .eq(
          "id",
          row.organization_id
        )
        .maybeSingle();


    if (organization) {

      enriched["Organization"] =
        organization.name;

    }

  }


  /*
    Legal entity name
  */


  if (
    row.entity_id &&
    row.organization_id
  ) {

    const entity =
      await resolveEntity({

        organizationId:
          row.organization_id,

        entityId:
          row.entity_id,

      });


    if (entity) {

      enriched["Entity"] =
        entity.display_name ||
        entity.legal_name;

    }

  }


  /*
    Remove technical ids from display
  */


  delete enriched.organization_id;

  delete enriched.entity_id;


  delete enriched.created_at;
  delete enriched.updated_at;
  delete enriched.started_at;
  delete enriched.completed_at;


  const display = {

    ...(enriched["Organization"]
      ? {
          Organization:
            enriched["Organization"],
        }
      : {}),


    ...(enriched["Entity"]
      ? {
          Entity:
            enriched["Entity"],
        }
      : {}),


    ...(enriched["Assigned To"]
      ? {
          "Assigned To":
            enriched["Assigned To"],
        }
      : {}),


    ...enriched,

  };


  return Object.fromEntries(
    Object.entries(display)
      .filter(([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== ""
      )
  );

}
