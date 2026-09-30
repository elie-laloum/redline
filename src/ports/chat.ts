export interface Channel {
  readonly id: string;
  readonly name: string;
}

export interface Chat {
  findChannel(name: string): Promise<Channel | null>;
  createChannel(name: string, isPrivate: boolean): Promise<Channel>;
  lookupByEmail(email: string): Promise<string | null>;
  invite(channelId: string, userIds: readonly string[]): Promise<void>;
  postMessage(channelId: string, text: string): Promise<{ readonly ts: string }>;
  history(channelId: string): Promise<readonly string[]>;
  addBookmark(channelId: string, title: string, link: string): Promise<void>;
  bookmarks(channelId: string): Promise<readonly string[]>;
}
