"use client";

import { useState } from "react";


export default function DynamicCustomerField({
  field,
  value = {},
  onChange,
  organizationId,
}) {


  const [results,setResults] =
    useState([]);


  const [search,setSearch] =
    useState(
      value.customer_name || ""
    );


  function update(name,val){

    onChange(
      field.name,
      {
        ...value,
        [name]:val,
      }
    );

  }


  async function searchCustomers(text){

    setSearch(text);

    update(
      "customer_name",
      text
    );


    if(!text){

      setResults([]);

      return;

    }


    const res =
      await fetch(
        "/api/customers/search",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
          },
          body:JSON.stringify({

            organizationId,

            query:text,

          }),
        }
      );


    const json =
      await res.json();


    if(json.success){

      setResults(
        json.customers || []
      );

    }

  }


  function selectCustomer(customer){

    setResults([]);

    setSearch(
      customer.display_name || ""
    );


    update(
      "party_id",
      customer.id
    );


    update(
      "customer_name",
      customer.display_name || ""
    );


    update(
      "customer_email",
      customer.email || ""
    );


    update(
      "customer_phone",
      customer.phone || ""
    );


    update(
      "existing_customer",
      true
    );

  }


  return (

    <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-5">

      <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/40">
        {field.label}
      </div>


      <div className="relative">

        <input

          value={search}

          onChange={e =>
            searchCustomers(
              e.target.value
            )
          }

          placeholder="Search customer or enter new customer name..."

          className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />


        {
          results.length > 0 ? (

            <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#111] p-2">

              {
                results.map(customer => (

                  <button

                    key={customer.id}

                    type="button"

                    onClick={() =>
                      selectCustomer(customer)
                    }

                    className="block w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10"

                  >

                    {customer.display_name}

                    {
                      customer.email ? (
                        <span className="ml-2 text-white/40">
                          {customer.email}
                        </span>
                      ) : null
                    }

                  </button>

                ))
              }

            </div>

          ) : null
        }

      </div>


      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">


        <select

          value={
            value.customer_type || "PERSON"
          }

          onChange={e =>
            update(
              "customer_type",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        >

          <option value="PERSON">
            Person
          </option>

          <option value="COMPANY">
            Company
          </option>

        </select>


        {
          value.customer_type === "COMPANY" ? (

            <input

              placeholder="Company Name"

              value={
                value.company_name || ""
              }

              onChange={e =>
                update(
                  "company_name",
                  e.target.value
                )
              }

              className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

            />

          ) : null
        }


        <input

          placeholder="Email"

          value={
            value.customer_email || ""
          }

          onChange={e =>
            update(
              "customer_email",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />


        <input

          placeholder="Phone"

          value={
            value.customer_phone || ""
          }

          onChange={e =>
            update(
              "customer_phone",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />


        <input

          placeholder="Tax Number"

          value={
            value.tax_number || ""
          }

          onChange={e =>
            update(
              "tax_number",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />


        <input

          placeholder="Billing Address"

          value={
            value.billing_address || ""
          }

          onChange={e =>
            update(
              "billing_address",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />


        <input

          placeholder="City"

          value={
            value.city || ""
          }

          onChange={e =>
            update(
              "city",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />


        <input

          placeholder="Country"

          value={
            value.country || "Thailand"
          }

          onChange={e =>
            update(
              "country",
              e.target.value
            )
          }

          className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-white"

        />

      </div>

    </div>

  );

}
