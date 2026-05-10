"use client";

export default function LayoutRenderer({
  poster,
}) {

  const displayDate =

    poster.eventDate ||

    "Friday";

  const displayTime =

    poster.eventTime ||

    "8PM";

  switch (poster.layout) {

    case "Centered":

      return (

        <div
          className="
            absolute
            inset-0
            flex
            items-center
            justify-center
            text-center
            z-20
            p-10
          "
        >

          <div>

            <div
              className="
                uppercase
                tracking-[0.4em]
                text-orange-500
                mb-6
              "
            >
              {poster.campaignSubtitle}
            </div>

            <h1
              className="
                text-8xl
                uppercase
                leading-none
                text-white
                mb-6
              "
            >
              {poster.campaignTitle}
            </h1>

            <div
              className="
                text-2xl
                uppercase
                tracking-[0.2em]
                text-white/90
              "
            >
              {displayDate} {displayTime}
            </div>

          </div>

        </div>

      );

    case "Minimal":

      return (

        <div
          className="
            absolute
            bottom-10
            left-10
            z-20
          "
        >

          <h1
            className="
              text-6xl
              uppercase
              text-white
              font-light
            "
          >
            {poster.campaignTitle}
          </h1>

          <div
            className="
              mt-4
              text-xl
              uppercase
              tracking-[0.2em]
              text-white/70
            "
          >
            {displayDate} {displayTime}
          </div>

        </div>

      );

    case "Classic":
    default:

      return (

        <div
          className="
            absolute
            bottom-20
            left-10
            z-20
          "
        >

          <div
            className="
              uppercase
              tracking-[0.4em]
              text-orange-500
              mb-5
            "
          >
            {poster.campaignSubtitle}
          </div>

          <h1
            className="
              text-7xl
              uppercase
              leading-none
              text-white
              mb-5
            "
          >
            {poster.campaignTitle}
          </h1>

          <div
            className="
              text-2xl
              tracking-[0.2em]
              uppercase
              text-white/90
            "
          >
            {displayDate} {displayTime}
          </div>

        </div>

      );

  }

}