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
      <h2 className="font-mono text-xl font-semibold">Q&A</h2>
      <div className="min-h-52 rounded border border-border bg-panel p-4">
        {historyLoading ? <p className="text-sm text-muted">Loading Q&A history...</p> : null}
        {!historyLoading && messages.length === 0 ? <p className="text-sm text-muted">Ask a repo-specific question after analysis completes.</p> : null}
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={`${message.timestamp}-${index}`} className={message.error ? "rounded border border-danger/50 bg-danger/10 p-3" : "rounded border border-border bg-background p-3"}>
              <div className="font-mono text-xs text-muted">{message.role}</div>
              <p className="mt-1 text-sm leading-6">{message.content}</p>
              {message.role === "assistant" && message.sources ? (
                <>
                  <div className="mt-2 font-mono text-xs uppercase text-muted">confidence {message.confidence}</div>
                  {message.confidence === "low" ? (
                    <div className="mt-2 rounded border border-amber/50 bg-amber/10 px-3 py-2 text-xs leading-5 text-amber">
                      This answer is uncertain. Review the cited evidence before acting on it.
                    </div>
                  ) : null}
                  <SourceList sources={message.sources} />
                  {message.caveat ? <p className="mt-2 text-xs leading-5 text-muted">{message.caveat}</p> : null}
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
          className="focus-ring min-w-0 flex-1 rounded border border-border bg-panel px-3 py-2 text-sm"
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
