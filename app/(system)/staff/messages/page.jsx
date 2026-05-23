"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Send,
  Megaphone,
  UserPlus,
  Users,
  Check,
  Plus,
  X,
  Paperclip,
  Trash2,
  Pencil,
  Pin,
  Star,
  Flag,
  ClipboardCheck,
} from "lucide-react";

export default function StaffMessagesPage() {

  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  const headers = {};

  const [selectedChat, setSelectedChat] = useState(null);
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [content, setContent] = useState("");
  const [staff, setStaff] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastContent, setBroadcastContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);

  async function loadInbox() {

    const res = await fetch(
      "/api/messages/inbox",
      { headers }
    );

    const data = await res.json();

    setThreads(data.threads || []);

  }

  async function loadMessages(threadId) {

    const [
      messageRes,
      memberRes,
      typingRes,
    ] = await Promise.all([

      fetch(
        `/api/messages/list?thread_id=${threadId}`,
        { headers }
      ),

      fetch(
        `/api/messages/thread-members?thread_id=${threadId}`,
        { headers }
      ),

      fetch(
        `/api/messages/typing?thread_id=${threadId}`
      ),

    ]);

    const messageData =
      await messageRes.json();

    const memberData =
      await memberRes.json();

    const typingData =
      await typingRes.json();

    setTypingUsers(
      typingData.typing || []
    );

    setMessages(
      messageData.messages || []
    );

    setMembers(
      memberData.members || []
    );

    setTimeout(() => {

      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });

    }, 100);

  }

  async function sendMessage() {

    if (!selectedChat || !content)
      return;

    const res = await fetch(
      "/api/messages/send",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          thread_id:
            selectedChat.id,

          content,

        }),
      }
    );

    const data =
      await res.json();

    if (data.message) {

      setMessages((prev) => [
        ...prev,
        data.message,
      ]);

      setContent("");

      loadInbox();

      setTimeout(() => {

        bottomRef.current?.scrollIntoView({
          behavior:
            "smooth",
        });

      }, 100);

    }

  }

  async function moderateMessage(content) {

    const res =
      await fetch(
        "/api/messages/moderation",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            content,
          }),
        }
      );

    return await res.json();

  }

  useEffect(() => {

    loadInbox();

    const interval =
      setInterval(async () => {

        loadInbox();

        if (selectedChat) {

          loadMessages(
            selectedChat.id
          );

        }

      }, 3000);

    return () =>
      clearInterval(interval);

  }, [selectedChat]);

  return (

    <div className="h-full overflow-hidden text-white">

      {!selectedChat ? (

        <div className="flex h-[calc(100vh-180px)] flex-col">

          <div className="flex items-center justify-between px-5 pb-4 pt-4">

            <div className="text-5xl font-black">
              Messages
            </div>

          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-32">

            <div className="space-y-3">

              {threads.map((chat) => (

                <button
                  key={chat.id}
                  onClick={() => {

                    setSelectedChat(chat);

                    loadMessages(chat.id);

                  }}
                  className="w-full rounded-[32px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-black p-5 text-left"
                >

                  <div className="flex items-start justify-between">

                    <div>

                      <div className="text-2xl font-bold">
                        {chat.title || "Conversation"}
                      </div>

                      <div className="mt-2 text-base text-white/50">
                        {chat.latest_message || "No messages"}
                      </div>

                    </div>

                  </div>

                </button>

              ))}

            </div>

          </div>

        </div>

      ) : (

        <div className="flex h-[calc(100vh-180px)] flex-col">

          <div className="border-b border-white/10 px-5 pb-5 pt-4">

            <div className="flex items-center gap-4">

              <button
                onClick={() =>
                  setSelectedChat(null)
                }
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
              >

                <ArrowLeft className="h-5 w-5" />

              </button>

              <div>

                <div className="text-2xl font-black">
                  {selectedChat.title}
                </div>

                <div className="mt-1 text-sm text-cyan-300">
                  Enterprise Runtime Active
                </div>

              </div>

            </div>

          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6">

            <div className="space-y-5">

              {messages.map((message) => (

                <div
                  key={message.id}
                  className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5"
                >

                  <div className="text-sm font-bold text-cyan-300">
                    {message.sender?.name}
                  </div>

                  <div className="mt-3 text-lg leading-relaxed">
                    {message.content}
                  </div>

                  <div className="mt-4 flex items-center gap-2">

                    <button
                      onClick={() => {

                        setEditingMessageId(
                          message.id
                        );

                        setEditingContent(
                          message.content
                        );

                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
                    >

                      <Pencil className="h-4 w-4" />

                    </button>

                    <button
                      onClick={async () => {

                        await fetch(
                          "/api/messages/delete",
                          {
                            method: "POST",

                            headers: {
                              "Content-Type":
                                "application/json",
                            },

                            body: JSON.stringify({
                              message_id:
                                message.id,
                            }),
                          }
                        );

                        setMessages(
                          (prev) =>
                            prev.filter(
                              (x) =>
                                x.id !==
                                message.id
                            )
                        );

                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10 text-red-300"
                    >

                      <Trash2 className="h-4 w-4" />

                    </button>

                  </div>

                </div>

              ))}

              <div ref={bottomRef} />

            </div>

          </div>

          <div className="border-t border-white/10 bg-black/80 p-4 backdrop-blur-3xl">

            <div className="flex items-center gap-3">

              <input
                value={content}
                onChange={(e) => {

                  setContent(
                    e.target.value
                  );

                }}
                placeholder="Type message..."
                className="h-14 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-lg outline-none"
              />

              <button
                onClick={async () => {

                  const moderation =
                    await moderateMessage(
                      content
                    );

                  if (
                    moderation.flagged
                  ) {

                    alert(
                      `Blocked words detected: ${moderation.matches.join(", ")}`
                    );

                    return;

                  }

                  sendMessage();

                }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 text-black"
              >

                <Send className="h-5 w-5" />

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}
