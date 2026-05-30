"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Search,
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

  const bottomRef =
    useRef(null);

  const fileRef =
    useRef(null);

  const headers = {};

  const runtime = null;

  const [
    selectedChat,
    setSelectedChat,
  ] = useState(null);

  const [
    threads,
    setThreads,
  ] = useState([]);

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
    staff,
    setStaff,
  ] = useState([]);

  const [
    selectedMembers,
    setSelectedMembers,
  ] = useState([]);

  const [
    groupTitle,
    setGroupTitle,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    showNewChat,
    setShowNewChat,
  ] = useState(false);

  const [
    groupMode,
    setGroupMode,
  ] = useState(false);

  const [
    broadcastMode,
    setBroadcastMode,
  ] = useState(false);

  const [
    showAddMembers,
    setShowAddMembers,
  ] = useState(false);

  const [
    broadcastTitle,
    setBroadcastTitle,
  ] = useState("");

  const [
    broadcastContent,
    setBroadcastContent,
  ] = useState("");


  async function loadInbox() {

    const res =
      await fetch(
        "/api/messages/inbox",
        {
          headers,
        }
      );

    const data =
      await res.json();

    setThreads(
      data.threads || []
    );

  }

  async function loadMessages(
    threadId
  ) {

    const [
      messageRes,
      memberRes,
      typingRes,
    ] = await Promise.all([

      fetch(
        `/api/messages/list?thread_id=${threadId}`,
        {
          headers,
        }
      ),

      fetch(
        `/api/messages/thread-members?thread_id=${threadId}`,
        {
          headers,
        }
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

      for (
        const message
        of messageData.messages || []
      ) {

        await fetch(
          "/api/messages/mark-read",
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

      }


    setMembers(
      memberData.members || []
    );

    setTimeout(() => {

      bottomRef.current?.scrollIntoView({
        behavior:
          "smooth",
      });

    }, 100);

  }

  async function loadStaff(
    query = ""
  ) {

    const res =
      await fetch(
        `/api/staff/search?query=${query}`,
        {
          headers,
        }
      );

    const data =
      await res.json();

    setStaff(
      data.staff || []
    );

  }

  async function addMembers() {

    if (
      selectedMembers.length === 0
    ) return;

    await fetch(
      "/api/messages/add-members",
      {
        method: "POST",

        headers: {
          ...headers,
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          thread_id:
            selectedChat.id,

          participant_ids:
            selectedMembers.map(
              (x) => x.id
            ),

        }),
      }
    );

    setShowAddMembers(
      false
    );

    setSelectedMembers([]);

    loadMessages(
      selectedChat.id
    );

  }

  async function createPrivateChat(
    targetId
  ) {

    const res =
      await fetch(
        "/api/messages/create-private",
        {
          method: "POST",

          headers: {
            ...headers,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            target_staff_id:
              targetId,

          }),
        }
      );

    const data =
      await res.json();

    if (
      data.thread
    ) {

      setShowNewChat(
        false
      );

      await loadInbox();

      setSelectedChat(
        data.thread
      );

      loadMessages(
        data.thread.id
      );

    }

  }

  async function createGroupChat() {

    if (
      selectedMembers.length === 0 ||
      !groupTitle
    ) return;

    const res =
      await fetch(
        "/api/messages/create-group",
        {
          method: "POST",

          headers: {
            ...headers,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            title:
              groupTitle,

            participant_ids:
              selectedMembers.map(
                (x) => x.id
              ),

          }),
        }
      );

    const data =
      await res.json();

    if (
      data.thread
    ) {

      setGroupMode(
        false
      );

      setSelectedMembers([]);

      setGroupTitle("");

      await loadInbox();

      setSelectedChat(
        data.thread
      );

      loadMessages(
        data.thread.id
      );

    }

  }

  async function sendBroadcast() {

    if (
      !broadcastContent
    ) return;

    const res =
      await fetch(
        "/api/messages/broadcast",
        {
          method: "POST",

          headers: {
            ...headers,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            title:
              broadcastTitle,

            content:
              broadcastContent,

          }),
        }
      );

    const data =
      await res.json();

    if (
      data.thread
    ) {

      setBroadcastMode(
        false
      );

      setBroadcastTitle("");

      setBroadcastContent("");

      loadInbox();

    }

  }

  async function sendMessage() {

    if (
      !selectedChat ||
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
              selectedChat.id,

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

      setContent("");

      setTimeout(() => {

        bottomRef.current?.scrollIntoView({
          behavior:
            "smooth",
        });

      }, 100);

    }

  }

  
  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    editingMessageId,
    setEditingMessageId,
  ] = useState(null);

  const [
    editingContent,
    setEditingContent,
  ] = useState("");

  const [
    typingUsers,
    setTypingUsers,
  ] = useState([]);

  const [
    onlineUsers,
    setOnlineUsers,
  ] = useState([]);




  
  
  async function createTaskFromMessage(message) {

    const title =
      prompt(
        "Task title",
        message.content
      );

    if (!title) return;

    await fetch(
      "/api/messages/create-task",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          title,

          description:
            message.content,

          thread_id:
            selectedChat.id,

          message_id:
            message.id,

        }),
      }
    );

    alert(
      "Task created"
    );

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


  async function uploadAttachment(file) {

    try {

      setUploading(true);

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const res =
        await fetch(
          "/api/messages/upload-attachment",
          {
            method: "POST",
            body: formData,
          }
        );

      const data =
        await res.json();

      if (!data.url) return;

      const sendRes =
        await fetch(
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

              content:
                file.name,

              attachment_url:
                data.url,

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

      }

    } finally {

      setUploading(false);

    }

  }


  useEffect(() => {

    loadInbox();

    fetch(
      "/api/messages/online-status",
      {
        method: "POST",
      }
    );

    const interval =
      setInterval(async () => {

        await fetch(
          "/api/messages/online-status",
          {
            method: "POST",
          }
        );

        const onlineRes =
          await fetch(
            "/api/messages/online-status"
          );

        const onlineData =
          await onlineRes.json();

        setOnlineUsers(
          onlineData.online || []
        );

        loadInbox();

        if (
          selectedChat
        ) {

          loadMessages(
            selectedChat.id
          );

        }

      }, 3000);

    return () =>
      clearInterval(
        interval
      );

  }, [selectedChat]);

  return (

    <div className="h-full overflow-hidden text-white">

      {!selectedChat ? (

        <div className="flex h-[calc(100vh-180px)] flex-col">

          <div className="flex items-center justify-between px-5 pb-4 pt-4">

            <div className="text-5xl font-black">
              Messages
            </div>

            <div className="flex items-center gap-3">

              <button
                onClick={() => {

                  setShowNewChat(
                    true
                  );

                  setGroupMode(
                    false
                  );

                  loadStaff();

                }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
              >

                <UserPlus className="h-5 w-5" />

              </button>

              <button
                onClick={() => {

                  setGroupMode(
                    true
                  );

                  setShowNewChat(
                    false
                  );

                  loadStaff();

                }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
              >

                <Users className="h-5 w-5" />

              </button>

              <button
                onClick={() =>
                  setBroadcastMode(
                    true
                  )
                }
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
              >

                <Megaphone className="h-5 w-5" />

              </button>

            </div>

          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-32">

            <div className="space-y-3">

              {threads.map(
                (chat) => (

                  <button
                    key={chat.id}
                    onClick={() => {

                      setSelectedChat(
                        chat
                      );

                      loadMessages(
                        chat.id
                      );

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

                      {chat.unread_count > 0 && (

                        <div className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-cyan-400 px-2 text-sm font-bold text-black">

                          {chat.unread_count}

                        </div>

                      )}

                    </div>

                  </button>

                ))}

            </div>

          </div>

        </div>

      ) : (

        <div className="flex h-[calc(100vh-180px)] flex-col">

          <div className="border-b border-white/10 px-5 pb-5 pt-4">

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-4">

                <button
                  onClick={() =>
                    setSelectedChat(
                      null
                    )
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

              <button
                onClick={() => {

                  setShowAddMembers(
                    true
                  );

                  loadStaff();

                }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
              >

                <Plus className="h-5 w-5" />

              </button>

            </div>

            {members.length > 0 && (

              <div className="mt-5 flex gap-3 overflow-x-auto">

                {members.map(
                  (member) => (

                    <div
                      key={member.id}
                      className="flex min-w-fit items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                    >

                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-cyan-400/10">

                        {member.staff?.profile_picture ? (

                          <img
                            src={
                              member.staff.profile_picture
                            }
                            className="h-full w-full object-cover"
                          />

                        ) : (

                          <div className="font-bold text-cyan-300">
                            {member.staff?.name?.[0]}
                          </div>

                        )}

                      </div>

                      <div>

                        <div className="flex items-center gap-2 text-sm font-bold">

                          <span>
                            {member.staff?.name}
                          </span>

                          {onlineUsers.find(
                            (x) =>
                              x.staff?.id ===
                              member.staff?.id
                          ) && (

                            <span className="h-2 w-2 rounded-full bg-green-400" />

                          )}

                        </div>

                        <div className="text-xs text-white/40">
                          {member.staff?.role}
                        </div>

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </div>

          {showAddMembers && (

            <div className="border-b border-white/10 bg-black/40 p-5">

              <div className="mb-4 flex items-center justify-between">

                <div className="text-2xl font-black">
                  Add Members
                </div>

                <button
                  onClick={() =>
                    setShowAddMembers(
                      false
                    )
                  }
                >

                  <X className="h-5 w-5 text-white/40" />

                </button>

              </div>

              <input
                value={search}
                onChange={(e) => {

                  setSearch(
                    e.target.value
                  );

                  loadStaff(
                    e.target.value
                  );

                }}
                placeholder="Search staff..."
                className="h-14 w-full rounded-2xl border border-white/10 bg-black/30 px-5 outline-none"
              />

              <div className="mt-4 space-y-3">

                {staff.map(
                  (member) => {

                    const active =
                      selectedMembers.find(
                        (x) =>
                          x.id ===
                          member.id
                      );

                    return (

                      <button
                        key={member.id}
                        onClick={() => {

                          if (
                            active
                          ) {

                            setSelectedMembers(
                              (prev) =>
                                prev.filter(
                                  (x) =>
                                    x.id !==
                                    member.id
                                )
                            );

                          } else {

                            setSelectedMembers(
                              (prev) => [
                                ...prev,
                                member,
                              ]
                            );

                          }

                        }}
                        className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                          active
                            ? "border-cyan-400/30 bg-cyan-400/10"
                            : "border-white/10 bg-white/[0.04]"
                        }`}
                      >

                        <div>

                          <div className="text-lg font-bold">
                            {member.name}
                          </div>

                          <div className="text-sm text-white/40">
                            {member.role}
                          </div>

                        </div>

                        {active && (

                          <Check className="h-5 w-5 text-cyan-300" />

                        )}

                      </button>

                    );

                  }
                )}

              </div>

              <button
                onClick={addMembers}
                className="mt-5 w-full rounded-2xl bg-cyan-400 py-4 font-bold text-black"
              >

                Add Members

              </button>

            </div>

          )}

          <div className="flex-1 overflow-y-auto px-5 py-6">

            <div className="space-y-5">

              {messages.map(
                (message) => (

                  <div
                    key={message.id}
                    className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5"
                  >

                    <div className="flex items-center gap-3">

                      {message.pinned && (

                        <div className="rounded-full bg-yellow-400 px-3 py-1 text-[10px] font-black text-black">
                          PINNED
                        </div>

                      )}

                      {message.starred && (

                        <div className="rounded-full bg-cyan-400 px-3 py-1 text-[10px] font-black text-black">
                          STARRED
                        </div>

                      )}

                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-cyan-400/10">

                        {message.sender?.profile_picture ? (

                          <img
                            src={
                              message.sender.profile_picture
                            }
                            className="h-full w-full object-cover"
                          />

                        ) : (

                          <div className="font-bold text-cyan-300">
                            {message.sender?.name?.[0]}
                          </div>

                        )}

                      </div>

                      <div>

                        <div className="text-sm font-bold text-cyan-300">
                          {message.sender?.name}
                        </div>

                        <div className="text-xs text-white/40">
                          {message.sender?.role}
                        </div>

                        <div className="text-[10px] text-cyan-300">
                          {message.reads?.length
                            ? "Seen"
                            : "Delivered"}
                        </div>

                      </div>

                    </div>

                    <div className="mt-4 flex items-start justify-between gap-4">

                      <div className="flex-1">

                        {editingMessageId === message.id ? (

                          <div className="space-y-3">

                            <textarea
                              value={editingContent}
                              onChange={(e) =>
                                setEditingContent(
                                  e.target.value
                                )
                              }
                              className="min-h-[120px] w-full rounded-2xl border border-cyan-400/20 bg-black/40 p-4 outline-none"
                            />

                            <div className="flex gap-3">

                              <button
                                onClick={async () => {

                                  const res =
                                    await fetch(
                                      "/api/messages/edit",
                                      {
                                        method: "POST",

                                        headers: {
                                          "Content-Type":
                                            "application/json",
                                        },

                                        body: JSON.stringify({

                                          message_id:
                                            message.id,

                                          content:
                                            editingContent,

                                        }),
                                      }
                                    );

                                  const data =
                                    await res.json();

                                  if (
                                    data.message
                                  ) {

                                    setMessages(
                                      (prev) =>
                                        prev.map(
                                          (x) =>
                                            x.id ===
                                            message.id
                                              ? {
                                                  ...x,
                                                  content:
                                                    editingContent,
                                                }
                                              : x
                                        )
                                    );

                                    setEditingMessageId(
                                      null
                                    );

                                  }

                                }}
                                className="rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black"
                              >

                                Save

                              </button>

                              <button
                                onClick={() =>
                                  setEditingMessageId(
                                    null
                                  )
                                }
                                className="rounded-xl border border-white/10 px-4 py-2"
                              >

                                Cancel

                              </button>

                            </div>

                          </div>

                        ) : (

                          <div className="text-lg leading-relaxed">
                            {message.content}
                          </div>

                        )}

                      </div>

                      <div className="flex items-center gap-2">

                        <button
                          onClick={async () => {

                            await fetch(
                              "/api/messages/star",
                              {
                                method: "POST",

                                headers: {
                                  "Content-Type":
                                    "application/json",
                                },

                                body: JSON.stringify({

                                  message_id:
                                    message.id,

                                  starred:
                                    !message.starred,

                                }),
                              }
                            );

                            loadMessages(
                              selectedChat.id
                            );

                          }}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                            message.starred
                              ? "bg-cyan-400 text-black"
                              : "border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
                          }`}
                        >

                          <Star className="h-4 w-4" />

                        </button>

                        <button
                          onClick={() =>
                            createTaskFromMessage(
                              message
                            )
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-400/20 bg-green-400/10 text-green-300"
                        >

                          <ClipboardCheck className="h-4 w-4" />

                        </button>

                        <button
                          onClick={async () => {

                            const reason =
                              prompt(
                                "Reason for report?"
                              );

                            await fetch(
                              "/api/messages/report",
                              {
                                method: "POST",

                                headers: {
                                  "Content-Type":
                                    "application/json",
                                },

                                body: JSON.stringify({

                                  message_id:
                                    message.id,

                                  reason,

                                }),
                              }
                            );

                          }}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10 text-red-300"
                        >

                          <Flag className="h-4 w-4" />

                        </button>

                        <button
                          onClick={async () => {

                            await fetch(
                              "/api/messages/pin",
                              {
                                method: "POST",

                                headers: {
                                  "Content-Type":
                                    "application/json",
                                },

                                body: JSON.stringify({

                                  message_id:
                                    message.id,

                                  pinned:
                                    !message.pinned,

                                }),
                              }
                            );

                            loadMessages(
                              selectedChat.id
                            );

                          }}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                            message.pinned
                              ? "bg-yellow-400 text-black"
                              : "border border-yellow-400/20 bg-yellow-400/10 text-yellow-300"
                          }`}
                        >

                          <Pin className="h-4 w-4" />

                        </button>

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

                    <div className="mt-4 flex flex-wrap gap-2">
                      {["👍","🔥","❤️","😂","👏"].map(
                        (emoji) => {

                          const count =
                            message.reactions?.filter(
                              (x) =>
                                x.emoji === emoji
                            ).length || 0;

                          const active =
                            message.reactions?.find(
                              (x) =>
                                x.staff_id ===
                                runtime?.staff?.id &&
                                x.emoji === emoji
                            );

                          return (

                            <button
                              key={emoji}
                              onClick={async () => {

                                await fetch(
                                  "/api/messages/reactions",
                                  {
                                    method: "POST",

                                    headers: {
                                      "Content-Type":
                                        "application/json",
                                    },

                                    body: JSON.stringify({

                                      message_id:
                                        message.id,

                                      emoji,

                                    }),
                                  }
                                );

                                loadMessages(
                                  selectedChat.id
                                );

                              }}
                              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm ${
                                active
                                  ? "bg-cyan-400 text-black"
                                  : "border border-white/10 bg-white/[0.04]"
                              }`}
                            >

                              <span>
                                {emoji}
                              </span>

                              {count > 0 && (
                                <span>
                                  {count}
                                </span>
                              )}

                            </button>

                          );

                        }
                      )}

                    </div>

                    {message.attachment_url && (

                      <a
                        href={message.attachment_url}
                        target="_blank"
                        className="mt-4 block rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-cyan-300"
                      >

                        Open Attachment

                      </a>

                    )}

                  </div>

                ))}

              <div ref={bottomRef} />

            </div>

          </div>

          <div className="border-t border-white/10 bg-black/80 p-4 backdrop-blur-3xl">

            {typingUsers.length > 0 && (

              <div className="mb-3 text-sm text-cyan-300">

                {typingUsers
                  .map(
                    (x) =>
                      x.staff?.name
                  )
                  .join(", ")}

                {" "}typing...

              </div>

            )}

            <div className="flex items-center gap-3">

              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {

                  const file =
                    e.target.files?.[0];

                  if (file) {

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
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
              >

                <Paperclip className="h-5 w-5" />

              </button>

              <input
                value={content}
                onChange={async (e) => {

                  setContent(
                    e.target.value
                  );

                  await fetch(
                    "/api/messages/typing",
                    {
                      method: "POST",

                      headers: {
                        "Content-Type":
                          "application/json",
                      },

                      body: JSON.stringify({

                        thread_id:
                          selectedChat.id,

                        typing:
                          e.target.value.length > 0,

                      }),
                    }
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

