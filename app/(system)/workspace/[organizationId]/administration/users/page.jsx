"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UserX,
  X,
} from "lucide-react";

const ROLE_OPTIONS = [
  "WAITER",
  "BAR",
  "KITCHEN",
  "ACCOUNTING",
  "MANAGER",
  "OWNER",
];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [actingRole, setActingRole] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("WAITER");
  const [newPosition, setNewPosition] = useState("FOH");

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users/create", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load staff access");
      }

      setUsers(result.staff || []);
      setActingRole(result.actingRole || "");
      setOrganizationId(result.organizationId || "");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load staff access");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const linkedCount = useMemo(
    () => users.filter((user) => Boolean(user.auth_user_id)).length,
    [users]
  );

  async function provisionAccess(payload, workKey) {
    setWorkingId(workKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to provision staff access");
      }

      setStatus(result.message || "Staff access provisioned.");
      await loadUsers();
      return true;
    } catch (provisionError) {
      setError(provisionError?.message || "Unable to provision staff access");
      return false;
    } finally {
      setWorkingId("");
    }
  }

  async function createUser() {
    if (!newName.trim() || !newEmail.trim() || !newRole) {
      setError("Name, email and role are required.");
      return;
    }

    const created = await provisionAccess(
      {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        position: newPosition.trim() || null,
      },
      "create"
    );

    if (!created) return;

    setShowModal(false);
    setNewName("");
    setNewEmail("");
    setNewRole("WAITER");
    setNewPosition("FOH");
  }

  async function sendAccess(user) {
    if (!user?.email) {
      setError("This staff account has no email address.");
      return;
    }

    await provisionAccess(
      {
        name: user.name || user.email,
        email: user.email,
        role: user.role || "WAITER",
        position: user.position || user.department || null,
      },
      `access:${user.id}`
    );
  }

  async function setActive(user, active) {
    setWorkingId(`active:${user.id}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/users/create", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: user.id,
          active,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update staff access");
      }

      setUsers((current) =>
        current.map((item) => (item.id === user.id ? result.staff : item))
      );
      setStatus(active ? "Staff access activated." : "Staff access deactivated.");
    } catch (updateError) {
      setError(updateError?.message || "Unable to update staff access");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />

          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                People · Identity
              </div>
              <h1 className="mt-3 text-4xl font-black">Staff Access</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/45">
                Employee identity, organization membership and secure portal access from one canonical record.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {organizationId ? `Organization ${organizationId}` : "Organization context"} · {actingRole || "Role"}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={loadUsers}
                disabled={loading}
                className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>

              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex h-12 items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black"
              >
                <Plus className="h-4 w-4" />
                Add staff
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Staff Accounts" value={users.length} />
          <Metric label="Auth Linked" value={linkedCount} />
          <Metric label="Pending Access" value={Math.max(users.length - linkedCount, 0)} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {status ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {status}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.035]">
          <div className="hidden grid-cols-[1.4fr_.8fr_.8fr_.7fr_1.15fr] gap-4 border-b border-white/10 px-5 py-4 text-[10px] uppercase tracking-[0.22em] text-white/35 lg:grid">
            <div>Employee</div>
            <div>Role</div>
            <div>Position</div>
            <div>Access</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-white/45">Loading staff access...</div>
          ) : users.length ? (
            users.map((user) => (
              <div
                key={user.id}
                className="grid gap-4 border-b border-white/[0.06] px-5 py-4 last:border-b-0 lg:grid-cols-[1.4fr_.8fr_.8fr_.7fr_1.15fr] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white/60">
                      <UserRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-black">{user.name || "Unnamed staff"}</div>
                      <div className="mt-1 flex items-center gap-1 truncate text-xs text-white/35">
                        <Mail className="h-3 w-3" />
                        {user.email || "No email"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-sm font-black text-[#D6A66A]">{user.role || "-"}</div>
                <div className="text-sm text-white/55">{user.position || user.department || "-"}</div>

                <div>
                  {user.auth_user_id ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" /> Linked
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">
                      <Mail className="h-3.5 w-3.5" /> Not linked
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {!user.auth_user_id ? (
                    <button
                      type="button"
                      disabled={workingId === `access:${user.id}` || !user.active}
                      onClick={() => sendAccess(user)}
                      className="flex h-10 items-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#E8C48F] disabled:opacity-40"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {workingId === `access:${user.id}` ? "Sending..." : "Send access"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={workingId === `active:${user.id}`}
                    onClick={() => setActive(user, !user.active)}
                    className={`flex h-10 items-center gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.14em] disabled:opacity-40 ${
                      user.active
                        ? "border border-red-500/20 bg-red-500/10 text-red-300"
                        : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {user.active ? <UserX className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {user.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-sm text-white/45">No staff accounts found.</div>
          )}
        </section>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[30px] border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">Secure Provisioning</div>
                <h2 className="mt-2 text-2xl font-black">Add staff member</h2>
                <p className="mt-2 text-sm text-white/40">
                  Creates or links the employee identity and sends secure access by email when needed.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-white/10 p-2 text-white/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Name">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Employee name"
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none focus:border-[#D6A66A]/60"
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="employee@company.com"
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none focus:border-[#D6A66A]/60"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <select
                    value={newRole}
                    onChange={(event) => setNewRole(event.target.value)}
                    className="h-12 w-full rounded-xl border border-white/10 bg-[#111] px-4 text-sm outline-none"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Position">
                  <input
                    value={newPosition}
                    onChange={(event) => setNewPosition(event.target.value)}
                    placeholder="FOH"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none focus:border-[#D6A66A]/60"
                  />
                </Field>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-12 flex-1 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black uppercase tracking-[0.16em] text-white/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createUser}
                disabled={workingId === "create"}
                className="h-12 flex-1 rounded-xl bg-[#D6A66A] text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
              >
                {workingId === "create" ? "Creating..." : "Create access"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</span>
      {children}
    </label>
  );
}
