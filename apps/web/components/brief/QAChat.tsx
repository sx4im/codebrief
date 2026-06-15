"use client";

import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import type { QAAnswer, QAConversationMessage } from "@codebrief/shared";
import { Button } from "@/components/ui/Button";
import { SourceList } from "./SourceList";

interface ApiError {
  error: string;
}

type QAApiResponse = QAAnswer & {
  mode?: "nvidia" | "fallback";
  messages?: QAConversationMessage[];
};

export function QAChat({ analysisId }: { analysisId: string }) {
  const [messages, setMessages] = useState<QAConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(`/api/analysis/${analysisId}/qa`);
        const json = (await response.json()) as { messages?: QAConversationMessage[]; error?: string };
        if (!cancelled && response.ok && Array.isArray(json.messages)) {
          setMessages(json.messages);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  async function ask() {
    if (!question.trim()) return;
    const current = question.trim();
    const timestamp = new Date().toISOString();
    setQuestion("");
    setMessages((existing) => [...existing, { role: "user", content: current, timestamp }]);
    setLoading(true);
    try {
      const response = await fetch(`/api/analysis/${analysisId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: current }),
      });
      const answer = (await response.json()) as QAApiResponse | ApiError;
      if (!response.ok || isApiError(answer)) {
        setMessages((existing) => [
          ...existing,
          {
            role: "assistant",
            content: isApiError(answer) ? answer.error : "Q&A is unavailable for this analysis.",
            error: true,
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
      if (Array.isArray(answer.messages)) {
        setMessages(answer.messages);
        return;
      }
      setMessages((existing) => [
        ...existing,
        {
          role: "assistant",
          content: answer.answer,
          sources: answer.sources,
          confidence: answer.confidence,
          caveat: answer.caveat,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setMessages((existing) => [
        ...existing,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Q&A request failed.",
          error: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="q-a" className="space-y-4">
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Q&amp;A</h2>
      <div className="min-h-52 rounded-lg border border-border bg-card p-4 shadow-card">
        {historyLoading ? <p className="text-sm text-mute">Loading Q&amp;A history...</p> : null}
        {!historyLoading && messages.length === 0 ? <p className="text-sm text-mute">Ask a repo-specific question after analysis completes.</p> : null}
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={`${message.timestamp}-${index}`} className={message.error ? "rounded-md border border-severity-critical/40 bg-severity-critical/5 p-3" : "rounded-md border border-border bg-bone/60 p-3"}>
              <div className="font-mono text-xs uppercase tracking-wide text-mute">{message.role}</div>
              <p className="mt-1 text-sm leading-6 text-body">{message.content}</p>
              {message.role === "assistant" && message.sources ? (
                <>
                  <div className="mt-2 font-mono text-xs uppercase text-mute">confidence {message.confidence}</div>
                  {message.confidence === "low" ? (
                    <div className="mt-2 rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-xs leading-5 text-severity-medium">
                      This answer is uncertain. Review the cited evidence before acting on it.
                    </div>
                  ) : null}
                  <SourceList sources={message.sources} />
                  {message.caveat ? <p className="mt-2 text-xs leading-5 text-mute">{message.caveat}</p> : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask();
          }}
          className="focus-ring min-w-0 flex-1 rounded-full border border-ink/20 bg-card px-4 py-2 text-sm text-ink placeholder:text-ash"
          placeholder="What would break if I removed the jobs module?"
        />
        <Button onClick={() => void ask()} disabled={loading}>
          <Send className="h-4 w-4" />
          Ask
        </Button>
      </div>
    </section>
  );
}

function isApiError(value: QAApiResponse | ApiError): value is ApiError {
  return "error" in value;
}
