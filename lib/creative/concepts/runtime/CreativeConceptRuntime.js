import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository,
} from "../repositories/CreativeConceptRepository";

function normalizeScope(input = {}) {
  if (typeof input === "string") {
    return {
      organization_id: input,
      creative_project_id: