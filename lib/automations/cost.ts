// Server-only helper for fetching a chat's cumulative usage from the agent
// API. Used by the automation runner to compute per-phase cost deltas.
// =============================================================================
//
// Endpoint shape (production VM):
//   GET https://agent-salesforce-link.replit.app/api/usage/{chat_id}
//   200 → { chat_id, usage: { input_tokens, output_tokens, total_tokens,
//                              cost_usd, updated_at } }
//   200 → { chat_id, usage: null, message: "No usage data found" }
//
// The endpoint reads from the agent's own copy of chat_usage, which is
// populated after each agent turn — so a fresh snapshot right after a
// phase completes will reflect that phase's tokens.
//
// All failures (network, 4xx, 5xx, malformed JSON) collapse to `null` and
// log. Phase-cost capture is best-effort: a missed snapshot just leaves
// that phase's cost_usd unset, which the UI handles by rendering nothing.
// =============================================================================

export interface ChatUsageSnapshot {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
}

const ZERO: ChatUsageSnapshot = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };

// Derive the usage base URL from whatever agent URL we have. The runner
// stores the /api/chat URL; we trim that off and append /api/usage/{id}.
function usageUrlFor(chatApiUrl: string, chatId: string): string {
    const trimmed = chatApiUrl.replace(/\/api\/chat\/?$/, "").replace(/\/$/, "");
    return `${trimmed}/api/usage/${encodeURIComponent(chatId)}`;
}

export async function fetchChatCostSnapshot(
    chatApiUrl: string,
    chatId: string
): Promise<ChatUsageSnapshot | null> {
    let res: Response;
    try {
        res = await fetch(usageUrlFor(chatApiUrl, chatId), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            // The runner is already on the server, so no CORS / cookies needed.
            cache: "no-store",
        });
    } catch (err) {
        console.warn(`[cost-snapshot] fetch threw for chat ${chatId}:`, err);
        return null;
    }
    if (!res.ok) {
        console.warn(`[cost-snapshot] non-OK ${res.status} for chat ${chatId}`);
        return null;
    }
    let body: unknown;
    try {
        body = await res.json();
    } catch (err) {
        console.warn(`[cost-snapshot] bad JSON for chat ${chatId}:`, err);
        return null;
    }
    const usage = (body as { usage?: unknown } | null)?.usage;
    if (!usage || typeof usage !== "object") return null;
    const u = usage as Record<string, unknown>;
    return {
        input_tokens: Number(u.input_tokens) || 0,
        output_tokens: Number(u.output_tokens) || 0,
        cost_usd: Number(u.cost_usd) || 0,
    };
}

// Subtract `prev` from `curr`, clamping to >= 0 (in case the agent's cumulative
// counter goes briefly stale and would otherwise produce negative deltas).
export function snapshotDelta(
    prev: ChatUsageSnapshot,
    curr: ChatUsageSnapshot
): ChatUsageSnapshot {
    return {
        input_tokens: Math.max(0, curr.input_tokens - prev.input_tokens),
        output_tokens: Math.max(0, curr.output_tokens - prev.output_tokens),
        cost_usd: Math.max(0, curr.cost_usd - prev.cost_usd),
    };
}

export const ZERO_SNAPSHOT = ZERO;
