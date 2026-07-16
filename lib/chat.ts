export type ChatRole = "user" | "agent";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

/** An email the agent fired as a side effect of the conversation. */
export interface EmailPreview {
  to: string;
  subject: string;
  body: string;
  status: "sent" | "queued" | "failed";
}

/** POST /api/chat request body. */
export interface ChatRequest {
  message: string;
  history: { role: ChatRole; content: string }[];
}

/** POST /api/chat response body. `email` is present only when the agent sent one. */
export interface ChatResponse {
  reply: string;
  email?: EmailPreview;
}

export function isChatResponse(value: unknown): value is ChatResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ChatResponse).reply === "string"
  );
}

let seq = 0;
export function messageId(): string {
  seq += 1;
  return `m${seq}`;
}

/**
 * Local stand-in used only when /api/chat is unreachable, so the UI is
 * demonstrable before the backend route lands. Never runs once /api/chat responds.
 */
export function mockResponse(message: string): ChatResponse {
  const asksAboutOrder = /order|cart|checkout|refund|deliver/i.test(message);

  if (asksAboutOrder) {
    return {
      reply:
        "Found your cart — 2 items, still saved. I've emailed you a link to finish checkout, plus free shipping for the next 24 hours.",
      email: {
        to: "customer@example.com",
        subject: "Your cart is still saved",
        body: "Hi there — your cart is still waiting for you. Complete your order in the next 24 hours and we'll cover shipping.",
        status: "sent",
      },
    };
  }

  return {
    reply:
      "I'm the store's support agent. Ask me about an order, a cart, or a refund and I'll take care of it.",
  };
}
