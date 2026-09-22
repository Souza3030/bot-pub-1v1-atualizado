export const IDs = {
  queueJoin: "queue:join",
  queueLeave: "queue:leave",
  checkin: "checkin",
  winnerBlue: "winner:blue",
  winnerRed: "winner:red",
  staffBlue: "staff:blue",
  staffRed: "staff:red",
  void: "staff:void",
} as const;

export function withId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

export function trailingId(customId: string): string {
  return customId.split(":").at(-1) ?? "";
}
