"use client";

import { useState } from "react";

export default function Page() {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function testInstagramPost() {
    try {
      setLoading(true);
      setResult("");

      const res = await fetch("/api/marketing/publish-instagram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caption: "Churchill AI Instagram Test",
          image_url:
            "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
          instagram_business_id: "17841401899330356",
          access_token: "EAATFg4oQC4cBRaGDGdEqNj9ZBNvkPZCuHUPEzqUJLrm8W7ZCWozvdo1ZBJhwG77eP89kiVYA6vS942zLqI346ZBT5oFjKVaWZBXw2ZAKuX8asBFYqEhRvfTGg408m9f74OyyDwZCghQU7G8yAkzxVfNgH9C519owW1VK6iOnlEQ2A34DyjZBkZAhGxkYIKyXoSqKhtCS4ZD",
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-4xl mb-6">Instagram Publish Test</h1>

      <button
        onClick={testInstagramPost}
        disabled={loading}
        className="bg-blue-500 text-white px-6 py-3 rounded-xl"
      >
        {loading ? "Publishing..." : "Test Instagram Publish"}
      </button>

      {result && (
        <pre className="mt-8 bg-white/10 p-6 rounded-xl whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}