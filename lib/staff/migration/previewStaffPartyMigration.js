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


function resolveRelationshipType(role = "") {

  const value =
    String(role)
      .toUpperCase();


  if (value.includes("OWNER")) {
    return "owner";
  }


  if (
    value.includes("CONTRACTOR")
  ) {
    return "contractor";
  }


  return "employee";

}


export async function previewStaffPartyMigration() {

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


  return (staff || [])
    .map(member => {

      const name =
        member.name ||
        member.email ||
        "Unknown";


      const profile =
        splitName(name);


      return {

        staff_id:
          member.id,

        name,

        email:
          member.email,

        organization_id:
          member.active_organization_id,

        party_type:
          "person",

        display_name:
          name,

        first_name:
          profile.first_name,

        last_name:
          profile.last_name,

        relationship_type:
          resolveRelationshipType(
            member.role
          ),

        metadata:{
          role:
            member.role,

          position:
            member.position,

          department:
            member.department,

        },

      };

    });

}
