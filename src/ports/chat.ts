export interface Channel {
  readonly id: string;
  readonly name: string;
}

export interface ChatIdentity {
  readonly user: string;
  readonly team: string;
  readonly scopes: readonly string[] | null;
}

export interface Chat {
  /** Null when the chat refuses the token. */
  whoami(): Promise<ChatIdentity | null>;
  findChannel(name: string): Promise<Channel | null>;
  createChannel(name: string, isPrivate: boolean): Promise<Channel>;
  lookupByEmail(email: string): Promise<string | null>;
  invite(channelId: string, userIds: readonly string[]): Promise<void>;
  postMessage(channelId: string, text: string): Promise<{ readonly ts: string }>;
  history(channelId: string): Promise<readonly string[]>;
  addBookmark(channelId: string, title: string, link: string): Promise<void>;
  bookmarks(channelId: string): Promise<readonly string[]>;
}
