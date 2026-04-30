"use client";

export default function DevPage() {
  const setRole = (role) => {
    document.cookie = `role=${role}; path=/`;
    window.location.reload();
  };

  return (
    <div className="p-10 text-white space-y-4">
      <h1 className="text-2xl font-bold">Dev Role Switch</h1>

      <div className="flex gap-4">
        <button onClick={() => setRole("owner")} className="btn-primary">Owner</button>
        <button onClick={() => setRole("manager")} className="btn-primary">Manager</button>
        <button onClick={() => setRole("staff")} className="btn-primary">Staff</button>
        <button onClick={() => setRole("production")} className="btn-primary">Production</button>
        <button onClick={() => setRole("accounting")} className="btn-primary">Accounting</button>
      </div>
    </div>
  );
}