"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

const roleMenus = {
  staff: {
    foh: [
      { name: "Home", href: "/staff" },
      { name: "POS", href: "/pos" },
      { name: "Tables", href: "/tables" },
      { name: "Kitchen", href: "/kitchen" },
    ],

    kitchen: [
      { name: "Home", href: "/staff" },
      { name: "Kitchen", href: "/kitchen" },
      { name: "Production", href: "/production" },
    ],

    bar: [
      { name: "Home", href: "/staff" },
      { name: "POS", href: "/pos" },
      { name: "Tables", href: "/tables" },
    ],
  },

  owner: [
  { name: "Dashboard", href: "/dashboard" },

  {
    name: "Marketing Ops",
    href: "/marketing/operations",
  },

  { name: "POS", href: "/pos" },
  { name: "Tables", href: "/tables" },
  { name: "Kitchen", href: "/kitchen" },
  { name: "Production", href: "/production" },
  { name: "Accounting", href: "/accounting" },
],

  manager: [
    { name: "Home", href: "/staff" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "POS", href: "/pos" },
    { name: "Tables", href: "/tables" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Production", href: "/production" },
  ],

  accounting: [
    { name: "Home", href: "/accounting" },
    { name: "Accounting", href: "/accounting" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "POS", href: "/pos" },
    { name: "Tables", href: "/tables" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Production", href: "/production" },
  ],
};

export default function AppShell({ children }) {

  const pathname = usePathname();

  const [role, setRole] =
    useState("staff");

  const [position, setPosition] =
    useState("foh");

  useEffect(() => {

    const loadUser = async () => {

      const { data } =
        await supabase.auth.getUser();

      if (!data?.user) return;

      const { data: userData } =
        await supabase

          .from("staff_accounts")

          .select("role, position")

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

  let menu = [];

  if (role === "staff") {

    menu =
      roleMenus.staff[position] ||
      roleMenus.staff.foh;

  } else {

    menu =
      roleMenus[role] || [];

  }

  const mobileMenu =
    menu.slice(0, 4);

  if (
    pathname === "/" ||
    pathname.startsWith("/login")
  ) {

    return children;

  }

  return (

    <div
      className="
        min-h-screen
        text-white
        relative
        bg-black
        overflow-hidden
      "
    >

      {/* BACKGROUND */}

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
          from-black/65
          via-black/45
          to-black/80
        "
      />

      <div
        className="
          relative
          z-10
          flex
          flex-col
        "
      >

        {/* TOPBAR */}

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
                text-orange-300
                uppercase
              "
            >
              {role} / {position}
            </div>

            {/* DESKTOP NAV */}

            <nav
              className="
                hidden
                lg:flex
                items-center
                gap-2
              "
            >

              {menu.map((item) => {

                const active =
                  pathname === item.href;

                return (

                  <Link
                    key={item.name}
                    href={item.href}
                    className={`

                      px-3
                      py-2
                      rounded-lg
                      text-xs
                      uppercase
                      tracking-[0.15em]
                      transition

                      ${
                        active
                          ? "bg-orange-500 text-black"
                          : "text-white/50 hover:text-white hover:bg-white/5"
                      }

                    `}
                  >

                    {item.name}

                  </Link>

                );

              })}

            </nav>

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

        {/* CONTENT */}

        <main
          className="
            mt-16
            w-full
            h-[calc(100vh-4rem)]
            overflow-y-auto
            p-6
            pb-24
          "
        >

          {children}

        </main>

      </div>

      {/* MOBILE NAV */}

      <div
        className="
          fixed
          bottom-0
          left-0
          right-0
          z-50
          md:hidden
        "
      >

        <div
          className="
            flex
            justify-around
            py-2
            bg-black/80
            border-t
            border-white/10
          "
        >

          {mobileMenu.map((item) => {

            const active =
              pathname === item.href;

            return (

              <Link
                key={item.name}
                href={item.href}
                className={`

                  flex
                  flex-col
                  items-center
                  text-xs

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

          })}

        </div>

      </div>

    </div>

  );

}