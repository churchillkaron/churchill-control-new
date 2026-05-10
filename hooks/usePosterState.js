"use client";

import { useState }
from "react";

export function usePosterState() {

  const [
    selectedImage,
    setSelectedImage,
  ] = useState(null);

  const [
    layout,
    setLayout,
  ] = useState("Classic");

  const [
    campaignType,
    setCampaignType,
  ] = useState("ABBA Night");

  const [
    campaignTitle,
    setCampaignTitle,
  ] = useState("ABBA NIGHT");

  const [
    campaignSubtitle,
    setCampaignSubtitle,
  ] = useState("LIVE AT CHURCHILL");

  const [
    eventDate,
    setEventDate,
  ] = useState("FRIDAY");

  const [
    eventTime,
    setEventTime,
  ] = useState("8PM");

  const [
  scheduledDate,
  setScheduledDate,
] = useState("");

const [
  scheduledTime,
  setScheduledTime,
] = useState("");

  const [
    footer,
    setFooter,
  ] = useState("Reserve Your Table");

  const [
    extraDirection,
    setExtraDirection,
  ] = useState("");

  const [
    mood,
    setMood,
  ] = useState("Luxury Nightlife");

  const [
    lighting,
    setLighting,
  ] = useState("Cinematic Warm");

  const [
    composition,
    setComposition,
  ] = useState("Hero Shot");

  const [
    atmosphere,
    setAtmosphere,
  ] = useState("Energetic");

  const [
    venue,
    setVenue,
  ] = useState("Churchill Phuket");

  const [
    subject,
    setSubject,
  ] = useState(
    "Guests enjoying nightlife"
  );

  const [
    engine,
    setEngine,
  ] = useState("full-ai");

  const [
    interiorImages,
    setInteriorImages,
  ] = useState([]);

  const [
    staffImages,
    setStaffImages,
  ] = useState([]);

  const [
    brandAssets,
    setBrandAssets,
  ] = useState([]);

  const [
    pageId,
    setPageId,
  ] = useState("");

  return {

    pageId,
    setPageId,

    selectedImage,
    setSelectedImage,

    layout,
    setLayout,

    campaignType,
    setCampaignType,

    campaignTitle,
    setCampaignTitle,

    campaignSubtitle,
    setCampaignSubtitle,

    eventDate,
    setEventDate,

    eventTime,
    setEventTime,

    footer,
    setFooter,

    extraDirection,
    setExtraDirection,

    mood,
    setMood,

    lighting,
    setLighting,

    composition,
    setComposition,

    atmosphere,
    setAtmosphere,

    venue,
    setVenue,

    subject,
    setSubject,

    engine,
    setEngine,

    interiorImages,
    setInteriorImages,

    staffImages,
    setStaffImages,

    brandAssets,
    setBrandAssets,

  };

}