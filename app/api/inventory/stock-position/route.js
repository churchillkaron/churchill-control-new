export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function GET(req) {

  try {

    const {
      searchParams,
    } = new URL(req.url);


    const organizationId =
      searchParams.get("organizationId");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("legalEntityId");


    const {
      data: ledger,
      error,
    } =
      await supabaseAdmin
        .from("inventory_ledger")
        .select(`
          item_id,
          warehouse_id,
          location_id,
          quantity,
          new_quantity
        `)
        .eq(
          "organization_id",
          organizationId
        )
        .eq(
          "entity_id",
          entityId
        )
        .order(
          "created_at",
          {
            ascending:false,
          }
        );


    if (error) {
      throw error;
    }


    const itemIds =
      [...new Set(
        (ledger || [])
          .map(r => r.item_id)
          .filter(Boolean)
      )];


    const warehouseIds =
      [...new Set(
        (ledger || [])
          .map(r => r.warehouse_id)
          .filter(Boolean)
      )];


    const locationIds =
      [...new Set(
        (ledger || [])
          .map(r => r.location_id)
          .filter(Boolean)
      )];


    const [
      items,
      warehouses,
      locations,
    ] =
      await Promise.all([

        supabaseAdmin
          .from("inventory_items")
          .select("id,name")
          .in(
            "id",
            itemIds
          ),

        supabaseAdmin
          .from("inventory_warehouses")
          .select("id,name")
          .in(
            "id",
            warehouseIds
          ),

        supabaseAdmin
          .from("inventory_locations")
          .select("id,name")
          .in(
            "id",
            locationIds
          ),

      ]);


    const itemMap =
      Object.fromEntries(
        (items.data || [])
          .map(i => [
            i.id,
            i.name,
          ])
      );


    const warehouseMap =
      Object.fromEntries(
        (warehouses.data || [])
          .map(w => [
            w.id,
            w.name,
          ])
      );


    const locationMap =
      Object.fromEntries(
        (locations.data || [])
          .map(l => [
            l.id,
            l.name,
          ])
      );


    const stock =
      Object.values(
        (ledger || [])
          .filter(row =>
            row.warehouse_id &&
            row.location_id
          )
          .reduce(
            (acc,row) => {

              const key =
                [
                  row.item_id,
                  row.warehouse_id,
                  row.location_id,
                ].join("|");


              if (!acc[key]) {

                acc[key] = {

                  item_id:
                    row.item_id,

                  warehouse_id:
                    row.warehouse_id,

                  location_id:
                    row.location_id,

                  item:
                    itemMap[row.item_id] ||
                    row.item_id,

                  warehouse:
                    warehouseMap[row.warehouse_id] ||
                    "-",

                  location:
                    locationMap[row.location_id] ||
                    "-",

                  quantity:0,

                };

              }


              acc[key].quantity +=
                Number(
                  row.new_quantity ??
                  row.quantity ??
                  0
                );


              return acc;

            },
            {}
          )
      );


    return NextResponse.json({

      success:true,

      metrics:{

        totalQuantity:
          stock.reduce(
            (sum,row)=>
              sum + Number(row.quantity || 0),
            0
          ),

        itemCount:
          new Set(
            stock.map(row => row.item)
          ).size,

        locationCount:
          new Set(
            stock.map(row =>
              row.location
            )
          ).size,

      },

      stock:
        Object.values(
          (ledger || [])
            .filter(row =>
              row.warehouse_id &&
              row.location_id
            )
            .reduce(
              (acc,row) => {

                const key =
                  [
                    row.item_id,
                    row.warehouse_id,
                    row.location_id,
                  ].join("|");


                if (!acc[key]) {

                  acc[key] = {

                    item_id:
                      row.item_id,

                    warehouse_id:
                      row.warehouse_id,

                    location_id:
                      row.location_id,

                    item:
                      itemMap[row.item_id] ||
                      row.item_id,

                    warehouse:
                      warehouseMap[row.warehouse_id] ||
                      "-",

                    location:
                      locationMap[row.location_id] ||
                      "-",

                    quantity:0,

                  };

                }


                acc[key].quantity +=
                  Number(
                    row.new_quantity ??
                    row.quantity ??
                    0
                  );


                return acc;

              },
              {}
            )
        ),

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
