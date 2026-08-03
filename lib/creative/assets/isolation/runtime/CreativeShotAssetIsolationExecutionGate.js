import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.strict-shot-asset-isolation-gate.v2",
);

function list(value) {
  return