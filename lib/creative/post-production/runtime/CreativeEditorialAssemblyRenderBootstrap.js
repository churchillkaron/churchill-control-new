import {
  CreativeEdlRenderRuntime,
} from "./CreativeEdlRenderRuntime";
import {
  CreativeEditorialAssemblyRenderRuntime,
} from "./CreativeEditorialAssemblyRenderRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.editorial-assembly-render-bootstrap.v1",
);
const CONTRACT = "AVANTIQO_EDITORIAL_ASSEMBLY_RENDER_BOOTSTRAP_V1";

function install() {
  if (CreativeEdlRenderRuntime[FLAG]) return;
  const renderWithoutAssembly = CreativeEdlRenderRuntime.render.bind(
    CreativeEdlRenderRuntime,
  );
  let assemblyRenderDepth = 0;

  Object.defineProperty(CreativeEdlRenderRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeEdlRenderRuntime.render = async function renderWithEditorialAssembly(
    input = {},
  ) {
    if (assemblyRenderDepth > 0) {
      return renderWithoutAssembly(input);
    }
    assemblyRenderDepth += 1;
    try {
      return await CreativeEditorialAssemblyRenderRuntime.render(input);
    } finally {
      assemblyRenderDepth -= 1;
    }
  };
}

install();

export const CreativeEditorialAssemblyRenderBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  assembly_contract: CreativeEditorialAssemblyRenderRuntime.contract,
  fail_closed: true,
  legacy_hard_cut_fast_path_preserved: true,
});
