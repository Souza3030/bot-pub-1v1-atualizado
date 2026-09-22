export const IDs = {
  queueJoin: "queue:join",
  queueLeave: "queue:leave",
  checkin: "checkin",
  result: "result",
  resultModal: "result-modal",
  approve: "staff:approve",
  reject: "staff:reject",
  void: "staff:void",
  scoreA: "score-a",
  scoreB: "score-b",
} as const;

export function withId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

export function trailingId(customId: string): string {
  return customId.split(":").at(-1) ?? "";
}
