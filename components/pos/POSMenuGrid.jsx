export default function POSMenuGrid({
  filteredMenu,
  category,
  setCategory,
  addItem,
  getSelectedQuantity,
  search,
  setSearch,
}) {
  return (
    <div className="flex h-full flex-col">

      {/* CATEGORY BAR */}
      <div className="mb-5 flex gap-3 overflow-x-auto pb-1">

        {[
          "starter",
          "main",
          "dessert",
        ].map(
          (menuCategory) => (
            <button
              key={menuCategory}
              onClick={() =>
                setCategory(
                  menuCategory
                )
              }
              className={`rounded-2xl px-5 py-3 text-sm transition-all duration-300 ${
                category ===
                menuCategory
                  ? "bg-[#8B5CF6] text-white shadow-[0_0_40px_rgba(139,92,246,0.25)]"
                  : "border border-white/10 bg-[#111117] text-white/50 hover:border-white/20 hover:bg-[#15151D]"
              }`}
            >
              {menuCategory}
            </button>
          )
        )}

      </div>

      {/* SEARCH */}
      <div className="mb-5">

        <input
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          placeholder="Search menu..."
          className="h-[58px] w-full rounded-[22px] border border-white/10 bg-[#111117] px-5 text-white outline-none transition placeholder:text-white/20 focus:border-[#8B5CF6]/40"
        />

      </div>

      {/* MENU GRID */}
      <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto pr-2 xl:grid-cols-3">

        {filteredMenu.map(
          (item) => {

            const stock =
              Number(
                item.stock || 0
              );

            const selected =
              getSelectedQuantity(
                item.id
              );

            const availableToAdd =
              stock - selected;

            const outOfStock =
              stock <= 0;

            const maxSelected =
              selected >= stock;

            return (
              <button
                key={item.id}
                onClick={() =>
                  addItem(item)
                }
                disabled={
                  outOfStock ||
                  maxSelected
                }
                className={`group relative flex min-h-[145px] flex-col justify-between overflow-hidden rounded-[24px] border p-4 text-left transition-all duration-300 ${
                  outOfStock ||
                  maxSelected
                    ? "border-white/5 bg-[#0E0E14] opacity-40"
                    : "border-white/10 bg-[#12121A] hover:-translate-y-[2px] hover:border-[#8B5CF6]/40 hover:bg-[#1A1A24] hover:shadow-[0_10px_40px_rgba(139,92,246,0.12)]"
                }`}
              >

                {/* TOP */}
                <div>

                  <div
                    className="leading-tight text-[20px]"
                    style={{
                      fontWeight: 300,
                      letterSpacing: "-0.05em",
                    }}
                  >
                    {item.name}
                  </div>

                  

                </div>

                {/* BOTTOM */}
                <div className="mt-8 flex items-end justify-between">

                  <div>

                    <div className="text-[10px] tracking-[0.25em] text-white/25">
                      PRICE
                    </div>

                    <div
                      className="mt-2 text-2xl"
                      style={{
                        fontWeight: 250,
                        letterSpacing: "-0.06em",
                      }}
                    >
                      ฿
                      {Number(
                        item.price || 0
                      )}
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-[10px] tracking-[0.25em] text-white/25">
                      STOCK
                    </div>

                    <div
                      className={`mt-2 text-sm ${
                        outOfStock
                          ? "text-red-400"
                          : availableToAdd <= 3
                          ? "text-yellow-400"
                          : "text-green-400"
                      }`}
                    >

                      {outOfStock
                        ? "OUT OF STOCK"
                        : availableToAdd <= 3
                        ? `LOW (${availableToAdd})`
                        : `${availableToAdd} AVAILABLE`}

                    </div>

                  </div>

                </div>

              </button>
            );
          }
        )}

      </div>

    </div>
  );
}
