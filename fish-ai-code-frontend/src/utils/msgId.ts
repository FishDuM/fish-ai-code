let nextMsgId = 0;

export function newMsgId(): string {
  return `local_${nextMsgId++}_${Date.now()}`;
}
