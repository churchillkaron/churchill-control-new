"use client";

import ClassicChurchill from "./templates/ClassicChurchill";
import EditorialLeft from "./templates/EditorialLeft";
import MinimalLuxury from "./templates/MinimalLuxury";
import LiveMusic from "./templates/LiveMusic";
import FoodPromo from "./templates/FoodPromo";
import GameRoom from "./templates/GameRoom";
import StoryFormat from "./templates/StoryFormat";

export default function PosterTemplateEngine(props) {

  const {
    template = "Classic Churchill",
    posterRef,
  } = props;

  switch (template) {

    case "Editorial Left":
      return (
        <EditorialLeft
          posterRef={posterRef}
          {...props}
        />
      );

    case "Minimal Luxury":
      return (
        <MinimalLuxury
          posterRef={posterRef}
          {...props}
        />
      );

    case "Live Music":
      return (
        <LiveMusic
          posterRef={posterRef}
          {...props}
        />
      );

    case "Food Promo":
      return (
        <FoodPromo
          posterRef={posterRef}
          {...props}
        />
      );

    case "Game Room":
      return (
        <GameRoom
          posterRef={posterRef}
          {...props}
        />
      );

    case "Story Format":
      return (
        <StoryFormat
          posterRef={posterRef}
          {...props}
        />
      );

    case "Classic Churchill":
    default:
      return (
        <ClassicChurchill
          posterRef={posterRef}
          {...props}
        />
      );
  }
}