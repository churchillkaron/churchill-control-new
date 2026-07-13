export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function GET(req) {

  try {

    await requireAuth();


    const { searchParams } =
      new URL(req.url);


    const organizationId =
      searchParams.get(
        "organizationId"
      );


    const taskType =
      searchParams.get(
        "task_type"
      );


    const access =
      await requireOrganizationAccess({

        organizationId,

      });


    if (!access.success) {

      return NextResponse.json(
        {
          success:false,
          error:access.error,
        },
        {
          status:access.status,
        }
      );

    }


    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("warehouse_tasks")
        .select("*")
        .eq(
          "organization_id",
          access.organizationId
        )
        .order(
          "created_at",
          {
            ascending:false,
          }
        );


    if(taskType){

      const filtered =
        await supabaseAdmin
          .from("warehouse_tasks")
          .select("*")
          .eq(
            "organization_id",
            access.organizationId
          )
          .eq(
            "task_type",
            taskType
          )
          .order(
            "created_at",
            {
              ascending:false,
            }
          );


      if(filtered.error){
        throw filtered.error;
      }


      const filteredTasks =
        filtered.data || [];


      const filteredItemIds =
        [
          ...new Set(
            filteredTasks
              .map(t => t.item_id)
              .filter(Boolean)
          )
        ];


      const filteredWarehouseIds =
        [
          ...new Set(
            filteredTasks
              .map(t => t.warehouse_id)
              .filter(Boolean)
          )
        ];


      const [
        filteredItemsResult,
        filteredWarehousesResult,
      ] =
        await Promise.all([

          supabaseAdmin
            .from("inventory_items")
            .select("id,name")
            .in(
              "id",
              filteredItemIds.length
                ? filteredItemIds
                : ["00000000-0000-0000-0000-000000000000"]
            ),


          supabaseAdmin
            .from("inventory_warehouses")
            .select("id,name")
            .in(
              "id",
              filteredWarehouseIds.length
                ? filteredWarehouseIds
                : ["00000000-0000-0000-0000-000000000000"]
            ),

        ]);


      const filteredItemMap =
        Object.fromEntries(
          (filteredItemsResult.data || [])
            .map(i => [
              i.id,
              i.name
            ])
        );


      const filteredWarehouseMap =
        Object.fromEntries(
          (filteredWarehousesResult.data || [])
            .map(w => [
              w.id,
              w.name
            ])
        );


      return NextResponse.json({

        success:true,

        tasks:
          filteredTasks.map(task => ({

            ...task,

            item_name:
              filteredItemMap[task.item_id] ||
              null,

            warehouse_name:
              filteredWarehouseMap[task.warehouse_id] ||
              null,

          })),

      });

    }


    if(error){
      throw error;
    }


    const tasks =
      data || [];


    const itemIds =
      [
        ...new Set(
          tasks
            .map(t => t.item_id)
            .filter(Boolean)
        )
      ];


    const warehouseIds =
      [
        ...new Set(
          tasks
            .map(t => t.warehouse_id)
            .filter(Boolean)
        )
      ];


    const locationIds =
      [
        ...new Set(
          tasks
            .map(t => t.location_id)
            .filter(Boolean)
        )
      ];


    const [
      itemsResult,
      warehousesResult,
      locationsResult,
    ] =
      await Promise.all([

        itemIds.length
          ? supabaseAdmin
              .from("inventory_items")
              .select("id,name")
              .in(
                "id",
                itemIds
              )
          : Promise.resolve({
              data:[],
              error:null,
            }),


        warehouseIds.length
          ? supabaseAdmin
              .from("inventory_warehouses")
              .select("id,name")
              .in(
                "id",
                warehouseIds
              )
          : Promise.resolve({
              data:[],
              error:null,
            }),


        locationIds.length
          ? supabaseAdmin
              .from("inventory_locations")
              .select("id,name")
              .in(
                "id",
                locationIds
              )
          : Promise.resolve({
              data:[],
              error:null,
            }),

      ]);


    const itemMap =
      Object.fromEntries(
        (itemsResult.data || [])
          .map(i => [
            i.id,
            i.name
          ])
      );


    const warehouseMap =
      Object.fromEntries(
        (warehousesResult.data || [])
          .map(w => [
            w.id,
            w.name
          ])
      );


    const locationMap =
      Object.fromEntries(
        (locationsResult.data || [])
          .map(l => [
            l.id,
            l.name
          ])
      );


    return NextResponse.json({

      success:true,

      tasks:
        tasks.map(task => ({

          ...task,

          item_name:
            itemMap[task.item_id] ||
            null,

          warehouse_name:
            warehouseMap[task.warehouse_id] ||
            null,

          location_name:
            locationMap[task.location_id] ||
            null,

        })),

    });


  } catch(error) {
    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
