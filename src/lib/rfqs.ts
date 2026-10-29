export const RFQ_STATUSES = ["draft", "issued", "evaluating", "awarded", "closed", "cancelled"] as const;

/** Status buttons per RFQ status: [endpoint, label]. Awarding has its own per-vendor button. */
export const RFQ_ACTIONS: Record<string, [string, string][]> = {
  draft: [["issue", "Issue RFQ"], ["cancel", "Cancel"]],
  issued: [["evaluate", "Start evaluation"], ["cancel", "Cancel"]],
  evaluating: [["cancel", "Cancel"]],
  awarded: [["close", "Close"]],
};
