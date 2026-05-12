export default function OperationsHeader({

  businesses,

  selectedBusiness,

  setSelectedBusiness,

}) {

  return (

    <div>

      <div className="text-3xl font-bold">
        Marketing Operations
      </div>

      <div className="text-white/50 mt-2">
        AI Marketing Operating System
      </div>

      <div className="mt-6">

        <select

          value={
            selectedBusiness?.page_id || ""
          }

          onChange={(e) => {

            const business =

              businesses.find(
                (b) =>
                  b.page_id ===
                  e.target.value
              );

            setSelectedBusiness(
              business || null
            );

          }}

          className="
            bg-black/40
            border
            border-white/10
            rounded-xl
            px-4
            py-3
            text-sm
            min-w-[280px]
          "
        >

          {businesses.map(
            (business) => (

              <option
                key={business.page_id}
                value={business.page_id}
              >

                {business.page_name}

              </option>

          ))}

        </select>

      </div>

    </div>

  );

}