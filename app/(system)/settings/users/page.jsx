"use client";

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
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        getCurrentUser();
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentUser) loadUsers();
  }, [currentUser]);

  async function getSession() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    getCurrentUser();
  }

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();

    if (!data?.user) {
      setCurrentUser(null);
      return;
    }

    const { data: userData } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (!userData) {
      setStatus("User not linked ❌");
      return;
    }

    setCurrentUser(userData);
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("tenant_id", currentUser.tenant_id);

    if (error) {
      setStatus(error.message);
      return;
    }

    setUsers(data || []);
    setStatus(`Loaded (${data?.length || 0})`);
  }

  async function addUser() {
    if (!newName || !newEmail) return;

    const { data, error } = await supabase
      .from("staff_accounts")
      .insert([
        {
          name: newName,
          email: newEmail,
          role: newRole,
          position: newPosition,
          tenant_id: currentUser.tenant_id,
          active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      setStatus(error.message);
      return;
    }

    setUsers((prev) => [...prev, data]);

    setShowModal(false);
    setNewName("");
    setNewEmail("");
    setNewRole("Staff");
    setNewPosition("FOH");
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

            <div className="flex gap-3 items-center">
              {currentUser?.role === "Owner" && (
                <button
                  onClick={() => toggleUserActive(user)}
                  className="text-yellow-400"
                >
                  {user.active ? "Deactivate" : "Activate"}
                </button>
              )}
            </div>
          </div>
        ))}

        {users.length === 0 && <p>No users found</p>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-gray-900 p-6 rounded w-80 space-y-4">

            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full p-2 bg-gray-800"
            />

            <input
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full p-2 bg-gray-800"
            />

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full p-2 bg-gray-800"
            >
              <option>Staff</option>
              <option>Manager</option>
              <option>Owner</option>
            </select>

            <select
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              className="w-full p-2 bg-gray-800"
            >
              <option>FOH</option>
              <option>BAR</option>
              <option>KITCHEN</option>
            </select>

            <div className="flex justify-between">
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button onClick={addUser} className="bg-orange-500 px-3 py-1">
                Add
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}