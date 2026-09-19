import AvantiqoWorldPage from "@/components/public/AvantiqoWorldPage";

export const metadata = { title: "Avantiqo Code | Avantiqo" };

export default function Page(){
  return <AvantiqoWorldPage config={{
    context:"Code",
    eyebrow:"AVANTIQO CODE",
    title:"An engineering engine that reads, writes, tests and ships code.",
    intro:"Avantiqo Code works directly with real repositories: understand architecture, plan the change, write and repair code, run tests, inspect diffs, integrate services and verify the result. It is a software-production engine — not a drawing tool or a generic coding illustration.",
    tone:"light",
    image:"/art/generated/usecases/code-hero-v3.png",
    sequence:["Read repo","Plan change","Write code","Run tests","Review diff","Integrate","Verify"],
    capabilities:[
      ["Repository intelligence","Read and reason across real repositories, architecture, dependencies, configuration and runtime behavior."],
      ["Code generation & repair","Write production code, create capabilities, fix defects, refactor systems and make scoped changes from explicit objectives."],
      ["Testing & validation","Run focused tests, linting, type checks, builds and regression validation before a change becomes trusted."],
      ["Integrations & APIs","Connect services, databases, APIs, events and external systems into governed application workflows."],
      ["Version-control workflow","Work with diffs, commits, branches and reviewable change sets so software work remains inspectable and reversible."],
      ["Verification & delivery","Confirm that the intended behavior actually works, preserve evidence and move approved changes through the correct deployment gate."],
    ],
    secondary:"Developer Platform",
    secondaryHref:"/developers"
  }}/>;
}
