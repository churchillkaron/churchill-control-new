"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MessageCircle,
  Send,
  Plus,
  Search,
  Users,
  CheckCheck,
  Trash2,
  Paperclip,
} from "lucide-react";

export default function StaffMessagesPage() {

  const bottomRef =
    useRef(null);

  const fileRef =
    useRef(null);

  const [
    identity,
    setIdentity,
  ] = useState(null);

  const [
    threads,
    setThreads,
  ] = useState([]);

  const [
    selectedThread,
    setSelectedThread,
  ] = useState(null);

  const [
    messages,
    setMessages,
  ] = useState([]);

  const [
    members,
    setMembers,
  ] = useState([]);

  const [
    content,
    setContent,
  ] = useState("");

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const headers =
    useMemo(
      () => ({
        "x-staff-email":
          localStorage.getItem(
            "staff_email"
          ) || "",
      }),
      []
    );

  async function loadInbox() {

    const res =
      await fetch(
        "/api/messages/inbox",
        { headers }
      );

    const data =
      await res.json();

    if (
      data.identity
    ) {

      setIdentity(
        data.identity
      );

    }

    setThreads(
      data.threads || []
    );

  }

  async function loadMessages(
    thread_id
  ) {

    const res =
      await fetch(
        `/api/messages/list?thread_id=${thread_id}`,
        { headers }
      );

    const data =
      await res.json();

    setMessages(
      data.messages || []
    );

    setTimeout(() => {

      bottomRef.current?.scrollIntoView({
        behavior:
          "smooth",
      });

    }, 100);

  }

  async function uploadAttachment(
    file
  ) {

    setUploading(true);

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    const uploadRes =
      await fetch(
        "/api/messages/upload-attachment",
        {
          method: "POST",

          headers,

          body: formData,
        }
      );

    const uploadData =
      await uploadRes.json();

    setUploading(false);

    if (
      !uploadData.url
    ) return;

    const sendRes =
      await fetch(
        "/api/messages/send",
        {
          method: "POST",

          headers: {
            ...headers,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            thread_id:
              selectedThread.id,

            content:
              file.name,

            attachment_url:
              uploadData.url,

          }),
        }
      );

    const sendData =
      await sendRes.json();

    if (
      sendData.message
    ) {

      setMessages(
        (prev) => [
          ...prev,
          sendData.message,
        ]
      );

      loadInbox();

    }

  }

  async function sendMessage() {

    if (
      !selectedThread ||
      !content
    ) return;

    const res =
      await fetch(
        "/api/messages/send",
        {
          method: "POST",

          headers: {
            ...headers,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            thread_id:
              selectedThread.id,
            content,
          }),
        }
      );

    const data =
      await res.json();

    if (
      data.message
    ) {

      setMessages(
        (prev) => [
          ...prev,
          data.message,
        ]
      );

      loadInbox();

    }

    setContent("");

  }

  useEffect(() => {

    loadInbox();

    const interval =
      setInterval(() => {

        if (
          selectedThread
        ) {

          loadMessages(
            selectedThread.id
          );

        }

      }, 4000);

    return () =>
      clearInterval(
        interval
      );

  }, [selectedThread]);

  return (

    <div className="min-h-screen bg-black text-white">

      <div className="grid h-screen grid-cols-[360px_1fr]">

        <div className="overflow-y-auto border-r border-white/10 bg-white/[0.03] p-5">

          <div className="text-2xl font-black">
            Messages
          </div>

          <div className="mt-6 space-y-3">

            {threads.map(
              (thread) => (

                <button
                  key={thread.id}
                  onClick={() => {

                    setSelectedThread(
                      thread
                    );

                    loadMessages(
                      thread.id
                    );

                  }}
                  className={`w-full rounded-2xl border p-4 text-left ${
                    selectedThread?.id ===
                    thread.id
                      ? "border-cyan-400/40 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >

                  <div className="font-semibold">
                    {thread.title}
                  </div>

                  <div className="mt-1 text-xs text-white/40">
                    {thread.latest_message}
                  </div>

                </button>

              )
            )}

          </div>

        </div>

        <div className="flex flex-col">

          <div className="border-b border-white/10 p-5">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-2xl font-black">

                  {selectedThread
                    ? selectedThread.title
                    : "Select Conversation"}

                </div>

              </div>

              {selectedThread && (

                <button
                  className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300"
                >

                  <Trash2 className="h-4 w-4" />

                </button>

              )}

            </div>

          </div>

          <div className="flex-1 overflow-y-auto p-6">

            <div className="space-y-4">

              {messages.map(
                (message) => (

                  <div
                    key={message.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
                  >

                    <div className="flex items-center gap-3">

                      <div className="text-sm font-semibold">
                        {message.sender?.name}
                      </div>

                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                        {message.sender?.role}
                      </div>

                    </div>

                    <div className="mt-3 text-sm text-white/80">
                      {message.content}
                    </div>

                    {message.attachment_url && (

                      <a
                        href={
                          message.attachment_url
                        }
                        target="_blank"
                        className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300"
                      >

                        <Paperclip className="h-4 w-4" />

                        Open Attachment

                      </a>

                    )}

                  </div>

                )
              )}

              <div ref={bottomRef} />

            </div>

          </div>

          {selectedThread && (

            <div className="border-t border-white/10 p-5">

              <div className="flex gap-3">

                <input
                  value={content}
                  onChange={(e) =>
                    setContent(
                      e.target.value
                    )
                  }
                  placeholder="Send message..."
                  className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none"
                />

                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {

                    const file =
                      e.target.files?.[0];

                    if (
                      file
                    ) {

                      uploadAttachment(
                        file
                      );

                    }

                  }}
                />

                <button
                  onClick={() =>
                    fileRef.current?.click()
                  }
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-5"
                >

                  <Paperclip className="h-5 w-5" />

                </button>

                <button
                  onClick={sendMessage}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 font-semibold text-black"
                >

                  <Send className="h-4 w-4" />

                  {uploading
                    ? "Uploading..."
                    : "Send"}

                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  );

}
