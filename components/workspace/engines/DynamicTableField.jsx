"use client";

export default function DynamicTableField({
  field,
  value = [],
  onChange,
}) {

  const rows =
    Array.isArray(value)
      ? value
      : [];


  function updateRow(index,key,val){

    const updated =
      rows.map((row,i)=>
        i === index
          ? {
              ...row,
              [key]:val,
            }
          : row
      );

    onChange(
      field.name,
      updated
    );

  }


  function addRow(){

    const empty = {};

    (field.columns || [])
      .forEach(column=>{
        empty[column.name]="";
      });


    onChange(
      field.name,
      [
        ...rows,
        empty
      ]
    );

  }


  function removeRow(index){

    onChange(
      field.name,
      rows.filter(
        (_,i)=>i!==index
      )
    );

  }


  return (

    <div className="col-span-full">

      <label className="mb-3 block text-xs uppercase tracking-[0.25em] text-white/40">

        {field.label}

      </label>


      <div className="overflow-auto rounded-xl border border-white/10">

        <table className="w-full text-sm">

          <thead className="bg-white/5">

            <tr>

              {(field.columns || [])
                .map(column=>(

                <th
                  key={column.name}
                  className="px-3 py-3 text-left text-xs text-white/50"
                >
                  {column.label}
                </th>

              ))}

              <th />

            </tr>

          </thead>


          <tbody>

            {rows.map((row,index)=>(

              <tr
                key={index}
                className="border-t border-white/10"
              >

                {(field.columns || [])
                  .map(column=>(

                  <td
                    key={column.name}
                    className="p-2"
                  >

                    <input

                      value={
                        row[column.name] || ""
                      }

                      onChange={e=>
                        updateRow(
                          index,
                          column.name,
                          e.target.value
                        )
                      }

                      className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white"

                    />

                  </td>

                ))}


                <td className="p-2">

                  <button
                    type="button"
                    onClick={()=>
                      removeRow(index)
                    }
                    className="text-xs text-red-300"
                  >
                    Remove
                  </button>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>


      <button

        type="button"

        onClick={addRow}

        className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70"

      >
        + Add Line
      </button>


    </div>

  );

}
