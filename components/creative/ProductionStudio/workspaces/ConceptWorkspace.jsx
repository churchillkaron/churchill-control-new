"use client";

export default function ConceptWorkspace({
  runtime,
}) {

  const concepts =
    runtime.conceptRuntime?.items || [];

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Concept Engine
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Creative Concepts
        </div>

      </div>

      {!concepts.length ? (

        <div className="text-white/40">
          No concepts have been created yet.
        </div>

      ) : (

        <div className="space-y-4">

          {concepts.map(concept => (

            <div
              key={concept.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-6"
            >

              <div className="text-lg font-semibold">
                {concept.title}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-5 text-sm">

                <div>
                  <div className="text-white/40">Hook</div>
                  <div>{concept.hook}</div>
                </div>

                <div>
                  <div className="text-white/40">Emotion</div>
                  <div>{concept.emotion}</div>
                </div>

                <div>
                  <div className="text-white/40">Message</div>
                  <div>{concept.message}</div>
                </div>

                <div>
                  <div className="text-white/40">Narrative</div>
                  <div>{concept.narrative}</div>
                </div>

                <div>
                  <div className="text-white/40">Visual Style</div>
                  <div>{concept.visual_style}</div>
                </div>

                <div>
                  <div className="text-white/40">Call To Action</div>
                  <div>{concept.call_to_action}</div>
                </div>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}
