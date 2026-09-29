import { fail } from "../domain/failure.ts";
import type { Channel, Chat } from "../ports/chat.ts";
import { request } from "./http.ts";

export interface SlackCredentials {
  readonly base: string;
  readonly token: string;
}

export function createSlack(credentials: SlackCredentials): Chat {
  const base = credentials.base.replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${credentials.token}` };

  const call = async <T>(method: string, payload: Readonly<Record<string, unknown>>): Promise<T> => {
    const { data } = await request<{ ok: boolean; error?: string } & T>(`${base}/${method}`, { method: "POST", headers, body: payload });
    if (!data?.ok) fail(`Slack ${method} a refuse : ${data?.error ?? "reponse illisible"}.`);
    return data;
  };

  const read = async <T>(method: string, query: Readonly<Record<string, string>>): Promise<T | null> => {
    const { data } = await request<{ ok: boolean } & T>(`${base}/${method}?${new URLSearchParams(query)}`, { headers });
    return data?.ok ? data : null;
  };

  const findChannel = async (name: string): Promise<Channel | null> => {
    const data = await read<{ channels?: Channel[] }>("conversations.list", {
      types: "private_channel,public_channel",
      limit: "1000",
      exclude_archived: "true",
    });
    return data?.channels?.find((channel) => channel.name === name) ?? null;
  };

  return {
    findChannel,

    async createChannel(name, isPrivate) {
      return (await findChannel(name)) ?? (await call<{ channel: Channel }>("conversations.create", { name, is_private: isPrivate })).channel;
    },

    async lookupByEmail(email) {
      return (await read<{ user?: { id: string } }>("users.lookupByEmail", { email }))?.user?.id ?? null;
    },

    async invite(channelId, userIds) {
      if (userIds.length > 0) await call("conversations.invite", { channel: channelId, users: userIds.join(",") });
    },

    async postMessage(channelId, text) {
      return { ts: (await call<{ ts: string }>("chat.postMessage", { channel: channelId, text, unfurl_links: false })).ts };
    },

    async history(channelId) {
      const data = await read<{ messages?: { text?: string }[] }>("conversations.history", { channel: channelId, limit: "200" });
      return (data?.messages ?? []).map((message) => message.text ?? "");
    },

    async addBookmark(channelId, title, link) {
      await call("bookmarks.add", { channel_id: channelId, title, type: "link", link });
    },

    async bookmarks(channelId) {
      const data = await read<{ bookmarks?: { link?: string }[] }>("bookmarks.list", { channel_id: channelId });
      return (data?.bookmarks ?? []).map((bookmark) => bookmark.link ?? "");
    },
  };
}
