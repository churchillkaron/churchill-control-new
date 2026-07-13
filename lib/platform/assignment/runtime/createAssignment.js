import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  createAssignment,
} from "../documents/Assignment";


export async function createAssignmentRecord(input) {

  const document =
    createAssignment(input);


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("assignments")
      .insert(document)
      .select()
      .single();


  if (error) {
    throw error;
  }


  return data;

}
