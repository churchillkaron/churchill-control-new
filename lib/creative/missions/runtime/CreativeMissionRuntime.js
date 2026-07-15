import {
  createCreativeMissionDocument,
} from "../documents/CreativeMission";

import {
  CreativeMissionRepository,
} from "../repositories/CreativeMissionRepository";

import {
  CreativeStateEngine,
} from "@/lib/creative/state/CreativeStateEngine";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export const CreativeMissionRuntime = {


  async list({

    organizationId,
    organization_id,

  }) {

    const resolvedOrganizationId =
      organizationId ||
      organization_id;

    console.log(
      "MISSION QUERY ORGANIZATION",
      resolvedOrganizationId
    );

    const missions =
      await CreativeMissionRepository.list({
        organization_id:
          resolvedOrganizationId,
      });

    console.log(
      "MISSION QUERY RESULT",
      missions
    );

    return missions || [];

  },


  async get(id) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("creative_missions")
        .select("*")
        .eq(
          "id",
          id
        )
        .single();


    if (error) {
      throw error;
    }


    return data;

  },


  async create(payload = {}) {

    const mission =
      createCreativeMissionDocument(
        payload
      );

    return CreativeMissionRepository.create(
      mission
    );

  },


  async update(
    id,
    values = {}
  ) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("creative_missions")
        .update({
          ...values,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        )
        .select()
        .single();


    if (error) {
      throw error;
    }


    return data;

  },


  async start(id) {

    await CreativeMissionRuntime.update(id, {
      status: "active",
      started_at:
        new Date().toISOString(),
    });

    const mission =
      await CreativeMissionRuntime.get(id);

    console.log(
      "MISSION AFTER UPDATE",
      mission
    );

    console.log(
      "START MISSION STATE INIT",
      {
        organization_id:
          mission.organization_id,

        creative_mission_id:
          mission.id,
      }
    );

    const state =
      await CreativeStateEngine.init({
        organization_id:
          mission.organization_id,

        creative_mission_id:
          mission.id,

        stage:
          CreativeStateEngine.stages.UNDERSTANDING,
      });

    console.log(
      "STATE CREATED",
      state
    );

    return mission;

  },


  async pause(id) {

    return CreativeMissionRuntime.update(id, {
      status: "paused",
    });

  },


  async complete(
    id,
    learning_summary = null,
  ) {

    return CreativeMissionRuntime.update(id, {
      status: "completed",
      learning_summary,
      completed_at:
        new Date().toISOString(),
    });

  },


  async archive(id) {

    return CreativeMissionRuntime.update(id, {
      status: "archived",
    });

  },



};
