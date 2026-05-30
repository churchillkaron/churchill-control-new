"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Bot,
  Mic,
  Send,
  Upload,
  Volume2,
  Sparkles,
  Crown,
} from "lucide-react";

export default function ChurchillAssistantPage() {

  const [aiInput, setAiInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [uploadedImage, setUploadedImage] = useState(null);

  const [runtimeStats, setRuntimeStats] = useState({
    revenueToday: 0,
    occupiedTables: 0,
    openOrders: 0,
  });

  const [notifications, setNotifications] = useState([]);
  const [insights, setInsights] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [liveTasks, setLiveTasks] = useState([]);
  const [realtimeFeed, setRealtimeFeed] = useState([]);
  const [aiActions, setAiActions] = useState([]);
  const [operationalScore, setOperationalScore] = useState(null);
  const [staffRuntime, setStaffRuntime] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  async function loadRuntimeStats() {

    try {

      const res = await fetch("/api/staff/ai-runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "Generate live operational intelligence",
        }),
      });

      const data = await res.json();

      if (data.runtime) setRuntimeStats(data.runtime);
      if (data.notifications) setNotifications(data.notifications);
      if (data.insights) setInsights(data.insights);
      if (data.recommendations) setRecommendations(data.recommendations);
      if (data.liveTasks) setLiveTasks(data.liveTasks);
      if (data.realtimeFeed) setRealtimeFeed(data.realtimeFeed);
      if (data.aiActions) setAiActions(data.aiActions);
      if (data.operationalScore) setOperationalScore(data.operationalScore);
      if (data.staffRuntime) setStaffRuntime(data.staffRuntime);
      if (data.snapshot) setSnapshot(data.snapshot);

    } catch (err) {

      console.error(err);

    }

  }

  useEffect(() => {

    loadRuntimeStats();

    const interval = setInterval(loadRuntimeStats, 15000);

    return () => clearInterval(interval);

  }, []);

  async function askAI() {

    if (!aiInput.trim()) return;

    const question = aiInput;

    try {

      setLoading(true);

      const res = await fetch("/api/staff/ai-runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "FOH",
          performance: "ELITE",
          rushMode: true,
          venueMood: "VIP NIGHT",
          question,
        }),
      });

      const data = await res.json();

      if (data.success) {

        setChatHistory((prev) => [
          ...prev,
          {
            role: "user",
            text: question,
          },
          {
            role: "ai",
            text: data.message,
          },
        ]);

        setAiInput("");

        speakAI(data.message);

      }

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  function speakAI(text) {

    if (!window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-US";
    utterance.rate = 1;

    window.speechSynthesis.speak(utterance);

  }

  function startVoice() {

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

      alert("Voice not supported");

      return;

    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      setAiInput(event.results[0][0].transcript);
    };

    recognition.start();

  }

  function handleImageUpload(e) {

    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => setUploadedImage(reader.result);

    reader.readAsDataURL(file);

  }

  const panels = [
    ...aiActions.map((item) => ({
      title: item.action,
      text: item.table || item.urgency || "AI Action",
      tag: "Action",
    })),
    ...notifications.map((item) => ({
      title: item.title,
      text: item.message,
      tag: item.priority || "Alert",
    })),
    ...insights.map((item) => ({
      title: item.title,
      text: item.insight,
      tag: "Insight",
    })),
    ...recommendations.map((item) => ({
      title: item.type,
      text: item.recommendation,
      tag: item.table || "Recommendation",
    })),
    ...liveTasks.map((item) => ({
      title: item.title,
      text: item.description,
      tag: item.priority || "Task",
    })),
  ].slice(0, 8);

  return (

    <div className="min-h-screen bg-black text-white pb-40">

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-200px] right-[-100px] h-[500px] w-[500px] rounded-full bg-violet-500/20 blur-[140px]" />
        <div className="absolute bottom-[-200px] left-[-100px] h-[500px] w-[500px] rounded-full bg-fuchsia-500/20 blur-[140px]" />
      </div>

      <div className="relative z-10 px-5 pt-8 pb-6 border-b border-white/10 bg-black/50 backdrop-blur-3xl">

        <div className="flex items-center justify-between gap-4">

          <div className="flex items-center gap-4">

            <div className="h-16 w-16 rounded-[26px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.35)]">
              <Bot className="h-8 w-8" />
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-violet-300">
                Churchill AI
              </div>
              <h1 className="text-3xl font-semibold mt-2">
                Hospitality Runtime
              </h1>
            </div>

          </div>

          <label className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center cursor-pointer">
            <Upload className="h-5 w-5" />
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>

        </div>

      </div>

      <div className="relative z-10 px-5 pt-6 grid grid-cols-3 gap-3">

        <div className="rounded-[24px] border border-emerald-500/10 bg-emerald-500/10 p-4">
          <div className="text-xs text-emerald-300 uppercase tracking-[0.2em]">Revenue</div>
          <div className="text-2xl font-bold mt-2">฿{Number(runtimeStats.revenueToday || 0).toLocaleString()}</div>
        </div>

        <div className="rounded-[24px] border border-fuchsia-500/10 bg-fuchsia-500/10 p-4">
          <div className="text-xs text-fuchsia-300 uppercase tracking-[0.2em]">Tables</div>
          <div className="text-2xl font-bold mt-2">{runtimeStats.occupiedTables || 0}</div>
        </div>

        <div className="rounded-[24px] border border-cyan-500/10 bg-cyan-500/10 p-4">
          <div className="text-xs text-cyan-300 uppercase tracking-[0.2em]">Orders</div>
          <div className="text-2xl font-bold mt-2">{runtimeStats.openOrders || 0}</div>
        </div>

      </div>

      {operationalScore && (
        <div className="relative z-10 px-5 pt-6">
          <div className="rounded-[32px] border border-emerald-500/10 bg-gradient-to-br from-emerald-500/10 to-black p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-emerald-300">Operational Score</div>
                <div className="text-4xl font-bold mt-3">{operationalScore.score}</div>
              </div>
              <div className="rounded-full bg-emerald-500/20 px-4 py-2 text-sm text-emerald-300">
                {operationalScore.level}
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadedImage && (
        <div className="relative z-10 px-5 pt-6">
          <div className="rounded-[30px] overflow-hidden border border-violet-500/20 bg-black/40">
            <img src={uploadedImage} alt="upload" className="h-[220px] w-full object-cover" />
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">AI Vision Upload</div>
                <div className="text-sm text-white/40">Image ready for AI analysis</div>
              </div>
              <button
                onClick={() => setAiInput("Analyze this uploaded image operationally")}
                className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-semibold"
              >
                Analyze
              </button>
            </div>
          </div>
        </div>
      )}

      {chatHistory.length === 0 && (
        <div className="relative z-10 px-5 pt-6 grid grid-cols-2 gap-4">
          {[
            "Translate guest message",
            "VIP service advice",
            "Wine pairing",
            "Guest complaint help",
          ].map((item) => (
            <button
              key={item}
              onClick={() => setAiInput(item)}
              className="rounded-[28px] border border-violet-500/10 bg-violet-500/10 p-5 text-left"
            >
              <Sparkles className="h-5 w-5 text-violet-300 mb-4" />
              <div className="font-semibold">{item}</div>
              <div className="text-sm text-white/40 mt-2">Quick action</div>
            </button>
          ))}
        </div>
      )}

      {panels.length > 0 && (
        <div className="relative z-10 px-5 pt-6 space-y-4">
          {panels.map((item, index) => (
            <div
              key={index}
              className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">{item.title}</div>
                  <div className="text-sm text-white/40 mt-2">{item.text}</div>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
                  {item.tag}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="relative z-10 px-5 pt-6 space-y-4">
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-[28px] px-5 py-4 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-white text-black"
                  : "border border-violet-500/10 bg-violet-500/10 text-white/90"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black via-black/95 to-transparent">

        <div className="rounded-[30px] border border-violet-500/20 bg-black/90 backdrop-blur-3xl shadow-[0_0_50px_rgba(168,85,247,0.2)]">

          <div className="flex items-center gap-3 p-3">

            <button
              onClick={startVoice}
              className="h-12 w-12 rounded-2xl bg-fuchsia-500/20 flex items-center justify-center"
            >
              <Mic className="h-5 w-5 text-fuchsia-300" />
            </button>

            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") askAI();
              }}
              placeholder="Ask Churchill AI..."
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/30"
            />

            <button
              onClick={askAI}
              className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 flex items-center justify-center"
            >
              {loading ? (
                <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>

          </div>

          <div className="px-5 pb-3 flex items-center justify-between text-xs text-white/40">

            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              AI Runtime Online
            </div>

            <button
              onClick={() => window.speechSynthesis.cancel()}
              className="flex items-center gap-2"
            >
              <Volume2 className="h-4 w-4" />
              Stop Voice
            </button>

          </div>

        </div>

      </div>

    </div>

  );

}
