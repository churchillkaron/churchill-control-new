"use client";

import { useMemo, useState } from "react";
import { Check, CornerDownRight, RotateCcw, UserRound } from "lucide-react";

export default function ImageStudioCommentsPanel({ workspace, persistence }) {
  const [showResolved, setShowResolved] = useState(false);
  const boardId = workspace.selection.artboard_id;
  const comments = useMemo(() => workspace.comments
    .filter((comment) => !boardId || comment.artboard_id === boardId)
    .filter((comment) => showResolved || comment.status !== "RESOLVED")
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))), [workspace.comments, boardId, showResolved]);

  const mutate = async (comment, type, payload = {}) => {
    const saved = await persistence.action(type, { id: comment.id, ...payload });
    workspace.updateCommentLocal(saved);
    workspace.focusComment(saved);
  };

  return <section className="mt-5">
    <div className="flex items-center justify-between gap-2">
      <div className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#948D84]">Review comments</div>
      <button type="button" onClick={() => setShowResolved((value) => !value)} className="text-[8px] text-[#918B83] hover:text-[#D6A66A]">{showResolved ? "Hide resolved" : "Show resolved"}</button>
    </div>
    <div className="mt-3 space-y-2">
      {comments.map((comment, index) => {
        const resolved = comment.status === "RESOLVED";
        const focused = workspace.ui.comment_focus_id === comment.id;
        return <div key={comment.id || index} className={`rounded-xl border p-2.5 ${focused ? "border-[#D6A66A]/30 bg-[#D6A66A]/[.05]" : "border-[#E2DED7] bg-[#FBFAF8]"}`}>
          <button type="button" onClick={() => workspace.focusComment(comment)} className="block w-full text-left">
            <div className="flex items-start gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#D6A66A] text-[7px] font-bold text-[#3A3026]">{index + 1}</span><span className="text-[9px] leading-4 text-[#665F57]">{comment.body}</span></div>
            <div className="mt-2 flex items-center gap-1.5 pl-6 text-[8px] text-[#99928A]"><CornerDownRight className="h-3 w-3" />{comment.layer_id ? "Attached to layer" : "Artboard pin"}</div>
          </button>
          <div className="mt-2 flex items-center gap-1.5">
            <UserRound className="h-3 w-3 text-[#AAA49C]" />
            <input value={comment.assigned_to || ""} onChange={(event) => workspace.updateCommentLocal({ ...comment, assigned_to: event.target.value })} onBlur={(event) => void mutate(comment, "update_comment", { assigned_to: event.target.value || null })} placeholder="Assignee user ID" className="min-w-0 flex-1 rounded border border-[#E2DED7] bg-[#FBFAF8] px-2 py-1 text-[8px] text-[#777169] outline-none focus:border-[#D6A66A]/30" />
            {resolved ? <button type="button" onClick={() => void mutate(comment, "update_comment", { status: "OPEN" })} title="Reopen" className="rounded border border-[#E2DED7] p-1 text-[#99928A] hover:text-[#D6A66A]"><RotateCcw className="h-3 w-3" /></button> : <button type="button" onClick={() => void mutate(comment, "resolve_comment")} title="Resolve" className="rounded border border-[#E2DED7] p-1 text-[#99928A] hover:text-[#607057]"><Check className="h-3 w-3" /></button>}
          </div>
        </div>;
      })}
      {!comments.length ? <div className="rounded-xl border border-dashed border-[#DDD8D0] p-3 text-[9px] text-[#99928A]">No {showResolved ? "review" : "open"} comments on this artboard.</div> : null}
    </div>
  </section>;
}
