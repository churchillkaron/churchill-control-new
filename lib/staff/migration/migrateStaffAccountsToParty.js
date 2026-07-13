import { supabaseAdmin } from "@/lib/shared/supabase/admin";


function splitName(name = "") {

  const parts =
    String(name)
      .trim()
      .split(/\s+/);


  return {

    first_name:
      parts.shift() || "",

    last_name:
      parts.join(" ") || "",

  };

}


function relationshipType(member) {

  const role =
    String(member.role || "")
      .toUpperCase();


  const position =
    String(member.position || "")
      .toLowerCase();


  if (
    role.includes("OWNER") ||
    position.includes("owner")
  ) {
    return "owner";
  }


  return "employee";

}


export async function migrateStaffAccountsToParty() {

  const {
    data: staff,
    error,
  } =
    await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .is("party_id", null);


  if (error) {
    throw error;
  }


  const results = [];


  for (const member of staff || []) {

    if (!member.active_organization_id) {
      continue;
    }

    const name =
      member.name ||
      member.email ||
      "Unknown";


    const {
      first_name,
      last_name,
    } =
      splitName(name);


    let party = null;


    const {
      data: existingParty,
      error: existingPartyError,
    } =
      await supabaseAdmin
        .from("parties")
        .select("*")
        .eq(
          "email",
          member.email
        )
        .maybeSingle();


    if (existingPartyError) {
      throw existingPartyError;
    }


    if (existingParty) {

      party = existingParty;

    } else {

      const {
        data: createdParty,
        error: partyError,
      } =
        await supabaseAdmin
          .from("parties")
          .insert({

            organization_id:
              member.active_organization_id,

            party_type:
              "person",

            display_name:
              name,

            email:
              member.email,

            status:
              "active",

          })
          .select()
          .single();


      if (partyError) {
        throw partyError;
      }


      party = createdParty;

    }


    const {
      error: profileError,
    } =
      await supabaseAdmin
        .from("party_person_profiles")
        .insert({

          party_id:
            party.id,

          first_name,

          last_name,

        });


    if (profileError) {
      throw profileError;
    }


    if (
      member.active_organization_id
    ) {

      const {
        error: relationshipError,
      } =
        await supabaseAdmin
          .from("party_relationships")
          .insert({

            party_id:
              party.id,

            organization_id:
              member.active_organization_id,

            relationship_type:
              relationshipType(member),

            status:
              "active",

            metadata:{

              access_role:
                member.role,

              position:
                member.position,

              department:
                member.department,

            },

          });


      if (relationshipError) {
        throw relationshipError;
      }

    }


    const {
      error:updateError,
    } =
      await supabaseAdmin
        .from("staff_accounts")
        .update({

          party_id:
            party.id,

        })
        .eq(
          "id",
          member.id
        );


    if (updateError) {
      throw updateError;
    }


    results.push({

      staff_id:
        member.id,

      party_id:
        party.id,

      name,

    });

  }


  return results;

}
