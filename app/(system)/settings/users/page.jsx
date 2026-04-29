"use client";
console.log("USERS PAGE LOADED");
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("Loading...");
  const [showModal, setShowModal] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("Staff");
  const [newPosition, setNewPosition] = useState("FOH");

  const [currentUser, setCurrentUser] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        init();
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function init() {
    setStatus("Checking user...");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      setCurrentUser(null);
      setStatus("Not logged in");
      return;
    }

    const userId = authData.user.id;

    const { data: userData, error } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("auth_user_id", userId)
      .single();

    if (error) {
      setStatus("User not linked ❌");
      return;
    }

    setCurrentUser(userData);
    loadUsers(userData.tenant_id);
  }

  async function loadUsers(tenant_id) {
    const { data, error } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("tenant_id", tenant_id);

    if (error) {
      setStatus(error.message);
      return;
    }

    setUsers(data || []);
    setStatus(`Loaded (${data?.length || 0})`);
  }

  async function addUser() {
  if (!newName || !newEmail) {
    setStatus("Name and Email required ❌");
    return;
  }

  setStatus("Inviting user...");

  const res = await fetch("/api/users/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: newName,
      email: newEmail,
      role: newRole,
      position: newRole === "Staff" ? newPosition : null, // ✅ FIX HERE
      tenant_id: currentUser.tenant_id,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    setStatus(data.error || "Failed ❌");
    return;
  }

  setStatus("User invited ✅");

  // ✅ Reset form
  setShowModal(false);
  setNewName("");
  setNewEmail("");
  setNewRole("Staff");
  setNewPosition("FOH");

  // ✅ Reload users
  loadUsers(currentUser.tenant_id);
}

  async function toggleUserActive(user) {
    const { error } = await supabase
      .from("staff_accounts")
      .update({ active: !user.active })
      .eq("id", user.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id ? { ...u, active: !u.active } : u
      )
    );
  }

  async function login() {
    await supabase.auth.signInWithPassword({
      email: "test@test.com",
      password: "123456",
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUsers([]);
    setStatus("Logged out");
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-2xl mb-6">Users</h1>

      <div className="flex gap-3 mb-6">
        {!session ? (
          <button onClick={login} className="bg-gray-700 px-4 py-2 rounded">
            Login
          </button>
        ) : (
          <button onClick={logout} className="bg-red-600 px-4 py-2 rounded">
            Logout
          </button>
        )}

        {currentUser?.role === "Owner" && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-orange-500 text-black px-4 py-2 rounded"
          >
            + Add User
          </button>
        )}
      </div>

      <p className="mb-4">{status}</p>

      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex justify-between p-3 rounded ${
              user.active ? "bg-gray-800" : "bg-gray-900 opacity-50"
            }`}
          >
            <div>
              <div>{user.name}</div>
              <div className="text-sm opacity-70">{user.email}</div>
              <div className="text-xs text-orange-400">
                {user.role} — {user.position || "FOH"}
              </div>
              {!user.active && (
                <div className="text-xs text-red-400">Inactive</div>
              )}
            </div>

            {currentUser?.role === "Owner" && (
              <button
                onClick={() => toggleUserActive(user)}
                className="text-yellow-400"
              >
                {user.active ? "Deactivate" : "Activate"}
              </button>
            )}
          </div>
        ))}

        {users.length === 0 && <p>No users found</p>}
      </div>

     {showModal && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
    <div className="bg-gray-900 p-6 rounded w-80 space-y-4">

      {/* NAME */}
      <input
    
    placeholder="Name"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="w-full p-2 bg-gray-800"
      />

      {/* EMAIL */}
      <input
        placeholder="Email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        className="w-full p-2 bg-gray-800"
      />

      {/* ROLE (THIS WAS MISSING) */}
      <select
  value={newRole}
  onChange={(e) => {
    console.log("CHANGED TO:", e.target.value);
    setNewRole(e.target.value);
  }}
  className="w-full p-2 bg-gray-800"
>
  <option value="Staff">Staff</option>
  <option value="Manager">Manager</option>
  <option value="Owner">Owner</option>
</select>

      {/* POSITION (ONLY FOR STAFF) */}
      {newRole === "Staff" && (
        <select
          value={newPosition}
          onChange={(e) => setNewPosition(e.target.value)}
          className="w-full p-2 bg-gray-800"
        >
          <option value="FOH">FOH</option>
          <option value="BAR">BAR</option>
          <option value="KITCHEN">KITCHEN</option>
        </select>
      )}

      {/* ACTIONS */}
      <div className="flex justify-between">
        <button onClick={() => setShowModal(false)}>Cancel</button>

        <button
          onClick={() => addUser()}
          className="bg-orange-500 px-3 py-1"
        >
          Add
        </button>
      </div>

    </div>
  </div>
)}
    </div>
  );
}