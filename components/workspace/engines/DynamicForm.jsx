"use client";

import { useState } from "react";
import DynamicTableField from "./DynamicTableField";
import DynamicCustomerField from "./DynamicCustomerField";

export default function DynamicForm({
  schema = [],
  values = {},
  onChange,

  organizationId,
  entityId,
}) {

  return (

    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

      {schema.map(field => (

        <FieldRenderer
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={onChange}
          organizationId={organizationId}
          entityId={entityId}
        />

      ))}

    </div>

  );

}


function FieldRenderer({
  field,
  value,
  onChange,
  organizationId,
  entityId,
}) {


  if (field.type === "customer") {

    return (

      <DynamicCustomerField

        field={field}

        value={value}

        onChange={onChange}

        organizationId={organizationId}

      />

    );

  }


  if (field.type === "table") {

    return (

      <DynamicTableField

        field={field}

        value={value}

        onChange={onChange}

      />

    );

  }


  if (field.type === "reference") {

    return (

      <ReferenceField

        field={field}

        value={value}

        onChange={onChange}

        organizationId={organizationId}

        entityId={entityId}

      />

    );

  }


  return (

    <div>

      <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-white/40">

        {field.label}

      </label>


      {field.type === "textarea" ? (

        <textarea

          rows={4}

          value={value || ""}

          onChange={e =>
            onChange(
              field.name,
              e.target.value
            )
          }

          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"

        />

      ) : (

        <input

          type={field.type || "text"}

          value={value || ""}

          onChange={e =>
            onChange(
              field.name,
              e.target.value
            )
          }

          className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none"

        />

      )}

    </div>

  );

}



function ReferenceField({
  field,
  value,
  onChange,
  organizationId,
}) {

  const [query,setQuery] =
    useState("");

  const [results,setResults] =
    useState([]);


  async function search(text){

    console.log(
      "CUSTOMER SEARCH CONTEXT",
      {
        organizationId,
        text,
      }
    );

    setQuery(text);


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


  return (

    <div className="relative">

      <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-white/40">

        {field.label}

      </label>


      <input

        value={query}

        onChange={e =>
          search(e.target.value)
        }

        placeholder="Search..."

        className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none"

      />


      {results.length > 0 && (

        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#111] p-2">

          {results.map(item => (

            <button

              key={item.id}

              type="button"

              onClick={() => {

                onChange(
                  field.name,
                  item.id
                );

                setQuery(
                  item.display_name
                );

                setResults([]);

              }}

              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"

            >

              {item.display_name}

              <span className="ml-2 text-xs text-white/40">

                {item.party_type}

              </span>

            </button>

          ))}

        </div>

      )}

    </div>

  );

}
