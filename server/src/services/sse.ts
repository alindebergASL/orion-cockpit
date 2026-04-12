import { Response } from 'express';

// Connected SSE clients, keyed by userId
const clients = new Map<number, Set<Response>>();

export function addClient(userId: number, res: Response): void {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId)!.add(res);

  res.on('close', () => {
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) {
      clients.delete(userId);
    }
  });
}

export function pushToUser(userId: number, event: string, data: unknown): void {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of userClients) {
    try {
      client.write(payload);
    } catch {
      userClients.delete(client);
    }
  }
}

export function pushToAll(event: string, data: unknown): void {
  for (const [userId] of clients) {
    pushToUser(userId, event, data);
  }
}
