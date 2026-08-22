const INCHES_PER_UNIT = Object.freeze({
  px: 1 / 96,
  pt: 1 / 72,
  mm: 1 / 25.4,
  cm: 1 / 2.54,
  in: 1,
});

function unit(value) {
  return String(value || "px").trim().toLowerCase();
}

export function isCreativeDesignUnit(value) {
  return Boolean(INCHES_PER_UNIT[unit(value)]);
}

export function convertCreativeDesignUnits(value, fromUnit, toUnit) {
  const source = unit(fromUnit);
  const target = unit(toUnit);
  if (!INCHES_PER_UNIT[source]) {
    throw new Error(`CREATIVE_DESIGN_UNIT_UNSUPPORTED:${source}`);
  }
  if (!INCHES_PER_UNIT[target]) {
    throw new Error(`CREATIVE_DESIGN_UNIT_UNSUPPORTED:${target}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("CREATIVE_DESIGN_UNIT_VALUE_INVALID");
  }
  const inches = number * INCHES_PER_UNIT[source];
  return inches / INCHES_PER_UNIT[target];
}

export function creativeDesignPagePoints(page = {}) {
  return {
    width: convertCreativeDesignUnits(page.width, page.unit || "px", "pt"),
    height: convertCreativeDesignUnits(page.height, page.unit || "px", "pt"),
  };
}

export const CreativeDesignUnitRuntime = Object.freeze({
  contract: "CREATIVE_DESIGN_UNIT_RUNTIME_V1",
  convert: convertCreativeDesignUnits,
  pagePoints: creativeDesignPagePoints,
});
