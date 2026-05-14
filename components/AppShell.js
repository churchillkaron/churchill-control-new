"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { usePathname } from "next/navigation";

import { supabase } from "@/lib/shared/supabase/client";

// =========================
// DOMAIN NAVIGATION
// =========================

const navigation = {

  // =========================
  // OWNER
  // =========================

  owner: {

    CONTROL: [

      {
        name: "Dashboard",
        href: "/dashboard",
      },

      {
        name: "History",
        href: "/history",
      },

      {
        name: "Alerts",
        href: "/alerts",
      }

    ],

    OPERATIONS: [

      {
        name: "POS",
        href: "/pos",
      },

      {
        name: "Tables",
        href: "/tables",
      },

      {
        name: "Kitchen",
        href: "/kitchen",
      },

      {
        name: "Production",
        href: "/production",
      },

    ],

    FINANCE: [

      {
        name: "Accounting",
        href: "/accounting-overview",
      },

      {
        name: "Shift Close",
        href: "/shift-close",
      },

      {
        name: "Shift History",
        href: "/shift-history",
      },

      {
        name: "Payout",
        href: "/payout",
      },

    ],

    MARKETING: [

      {
        name: "Operations",
        href: "/marketing/operations",
      },

      {
        name: "Design",
        href: "/marketing/design",
      },

      {
        name: "Queue",
        href: "/marketing/queue",
      },

    ],

    ADMIN: [

      {
        name: "Users",
        href: "/users",
      },

    ],

  },

  // =========================
  // MANAGER
  // =========================

  manager: {

    CONTROL: [

      {
        name: "Dashboard",
        href: "/dashboard",
      },

      {
  name: "Alerts",
  href: "/alerts",
}

    ],

    OPERATIONS: [

      {
        name: "POS",
        href: "/pos",
      },

      {
        name: "Tables",
        href: "/tables",
      },

      {
        name: "Kitchen",
        href: "/kitchen",
      },

      {
        name: "Production",
        href: "/production",
      },

    ],

    FINANCE: [

      {
        name: "Shift Close",
        href: "/shift-close",
      },

      {
        name: "Shift History",
        href: "/shift-history",
      },

    ],

  },

  // =========================
  // ACCOUNTING
  // =========================

  accounting: {

    FINANCE: [

      {
        name: "Accounting",
        href: "/accounting-overview",
      },

      {
        name: "Shift Close",
        href: "/shift-close",
      },

      {
        name: "Shift History",
        href: "/shift-history",
      },

      {
        name: "Payout",
        href: "/payout",
      },

    ],

  },

  // =========================
  // STAFF
  // =========================

  staff: {

    foh: {

      OPERATIONS: [

        {
          name: "POS",
          href: "/pos",
        },

        {
          name: "Tables",
          href: "/tables",
        },

      ],

    },

    kitchen: {

      OPERATIONS: [

        {
          name: "Kitchen",
          href: "/kitchen",
        },

        {
          name: "Production",
          href: "/production",
        },

      ],

    },

    bar: {

      OPERATIONS: [

        {
          name: "POS",
          href: "/pos",
        },

        {
          name: "Tables",
          href: "/tables",
        },

      ],

    },

  },

};

// =========================
// APP SHELL
// =========================

export default function AppShell({
  children,
}) {

  const pathname =
    usePathname();

  const [role, setRole] =
    useState("staff");

  const [
    position,
    setPosition,
  ] = useState("foh");

  const [
    expandedGroup,
    setExpandedGroup,
  ] = useState(null);

  // =========================
  // LOAD USER
  // =========================

  useEffect(() => {

    const loadUser =
      async () => {

        const {
          data,
        } =
          await supabase.auth.getUser();

        if (
          !data?.user
        ) {
          return;
        }

        const {
          data: userData,
        } = await supabase

          .from(
            "staff_accounts"
          )

          .select(`
            role,
            position
          `)

          .eq(
            "auth_user_id",
            data.user.id
          )

          .single();

        if (userData) {

          setRole(
            (
              userData.role ||
              "staff"
            ).toLowerCase()
          );

          setPosition(
            (
              userData.position ||
              "foh"
            ).toLowerCase()
          );

        }

      };

    loadUser();

  }, []);

  // =========================
  // RESOLVE NAVIGATION
  // =========================

  let navGroups =
    {};

  if (
    role ===
    "staff"
  ) {

    navGroups =
      navigation.staff[
        position
      ] ||
      navigation.staff.foh;

  } else {

    navGroups =
      navigation[
        role
      ] || {};

  }

  // =========================
  // MOBILE MENU
  // =========================

  const mobileMenu = [

    {
      name: "Dashboard",
      href: "/dashboard",
    },

    {
      name: "POS",
      href: "/pos",
    },

    {
      name: "Kitchen",
      href: "/kitchen",
    },

    {
      name: "Finance",
      href: "/accounting-overview",
    },

    {
      name: "More",
      href: "/dashboard",
    },

  ];

  // =========================
  // LOGIN EXCLUSION
  // =========================

  if (
    pathname === "/" ||
    pathname.startsWith(
      "/login"
    )
  ) {

    return children;

  }

  return (

    <div
      className="
        min-h-screen
        bg-black
        text-white
        relative
        overflow-hidden
      "
    >

      {/* ========================= */}
      {/* BACKGROUND */}
      {/* ========================= */}

      <div
        className="
          fixed
          inset-0
          bg-cover
          bg-center
          opacity-45
        "
        style={{
          backgroundImage:
            "url('/bg-hero-control.jpg')",
        }}
      />

      <div
        className="
          fixed
          inset-0
          bg-gradient-to-b
          from-black/70
          via-black/50
          to-black/85
        "
      />

      {/* ========================= */}
      {/* APP */}
      {/* ========================= */}

      <div
        className="
          relative
          z-10
          flex
          flex-col
        "
      >

        {/* ========================= */}
        {/* TOP NAV */}
        {/* ========================= */}

        <header
          className="
            fixed
            top-0
            left-0
            right-0
            h-16
            flex
            items-center
            justify-between
            px-6
            border-b
            border-white/10
            bg-black/30
            backdrop-blur-xl
            z-50
          "
        >

          {/* LEFT */}

          <div
            className="
              flex
              items-center
              gap-8
            "
          >

            <div
              className="
                text-xl
                font-bold
              "
            >

              CONTROL

            </div>

            <div
              className="
                hidden
                md:block
                text-xs
                uppercase
                text-orange-300
              "
            >

              {role}
              {" / "}
              {position}

            </div>

            {/* ========================= */}
            {/* DESKTOP GROUPS */}
            {/* ========================= */}

            <div
              className="
                hidden
                lg:flex
                items-center
                gap-3
              "
            >

              {Object.entries(
                navGroups
              ).map(
                ([
                  groupName,
                  items,
                ]) => (

                  <div
                    key={
                      groupName
                    }
                    className="relative"
                  >

                    <button
                      onClick={() =>
                        setExpandedGroup(
                          expandedGroup ===
                            groupName
                            ? null
                            : groupName
                        )
                      }
                      className="
                        px-3
                        py-2
                        rounded-lg
                        text-xs
                        uppercase
                        tracking-[0.15em]
                        bg-white/5
                        hover:bg-white/10
                        transition
                      "
                    >

                      {groupName}

                    </button>

                    {expandedGroup ===
                      groupName && (

                      <div
                        className="
                          absolute
                          top-12
                          left-0
                          min-w-[220px]
                          bg-black/90
                          border
                          border-white/10
                          rounded-2xl
                          p-2
                          space-y-1
                          backdrop-blur-xl
                        "
                      >

                        {items.map(
                          (
                            item
                          ) => {

                            const active =
                              pathname ===
                              item.href;

                            return (

                              <Link
                                key={
                                  item.name
                                }
                                href={
                                  item.href
                                }
                                className={`

                                  block
                                  px-4
                                  py-3
                                  rounded-xl
                                  text-sm
                                  transition

                                  ${
                                    active
                                      ? "bg-orange-500 text-black"
                                      : "text-white/70 hover:bg-white/5 hover:text-white"
                                  }

                                `}
                              >

                                {
                                  item.name
                                }

                              </Link>

                            );

                          }
                        )}

                      </div>

                    )}

                  </div>

                )
              )}

            </div>

          </div>

          {/* RIGHT */}

          <div
            className="
              text-xs
              text-green-400
              flex
              items-center
              gap-2
            "
          >

            ● Live

          </div>

        </header>

        {/* ========================= */}
        {/* CONTENT */}
        {/* ========================= */}

        <main
          className="
            mt-16
            h-[calc(100vh-4rem)]
            overflow-y-auto
            p-6
            pb-28
          "
        >

          {children}

        </main>

      </div>

      {/* ========================= */}
      {/* MOBILE NAV */}
      {/* ========================= */}

      <div
        className="
          fixed
          bottom-0
          left-0
          right-0
          md:hidden
          z-50
        "
      >

        <div
          className="
            flex
            justify-around
            items-center
            py-2
            bg-black/85
            border-t
            border-white/10
            backdrop-blur-xl
          "
        >

          {mobileMenu.map(
            (item) => {

              const active =
                pathname ===
                item.href;

              return (

                <Link
                  key={
                    item.name
                  }
                  href={
                    item.href
                  }
                  className={`

                    flex
                    flex-col
                    items-center
                    text-[10px]
                    min-w-[60px]
                    transition

                    ${
                      active
                        ? "text-orange-400"
                        : "text-white/60"
                    }

                  `}
                >

                  <span>

                    {item.name}

                  </span>

                </Link>

              );

            }
          )}

        </div>

      </div>

    </div>

  );

}
