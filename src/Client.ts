import { Accessor, Setter, batch, createSignal } from "solid-js";

import { AsyncEventEmitter } from "@vladfrangu/async_event_emitter";
import type { DataLogin, RevoltConfig } from "revolt-api";
import { API, Role } from "revolt-api";

import {
  Channel,
  Emoji,
  Message,
  Server,
  ServerMember,
  User,
} from "./classes/index.js";
import { AccountCollection } from "./collections/AccountCollection.js";
import {
  BotCollection,
  ChannelCollection,
  ChannelUnreadCollection,
  ChannelWebhookCollection,
  EmojiCollection,
  MessageCollection,
  ServerCollection,
  ServerMemberCollection,
  SessionCollection,
  UserCollection,
} from "./collections/index.js";
import {
  ConnectionState,
  EventClient,
  EventClientOptions,
  handleEventV1,
} from "./events/index.js";
import {
  HydratedChannel,
  HydratedEmoji,
  HydratedMessage,
  HydratedServer,
  HydratedServerMember,
  HydratedUser,
} from "./hydration/index.js";
import { RE_CHANNELS, RE_MENTIONS, RE_SPOILER } from "./lib/regex.js";

export type Session = { _id: string; token: string; user_id: string } | string;

/**
 * Events provided by the client
 */
export type Events = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: [error: any];

  connected: [];
  connecting: [];
  disconnected: [];
  ready: [];
  logout: [];

  messageCreate: [message: Message];
  messageUpdate: [message: Message, previousMessage: HydratedMessage];
  messageDelete: [message: HydratedMessage];
  messageDeleteBulk: [messages: HydratedMessage[], channel?: Channel];
  messageReactionAdd: [message: Message, userId: string, emoji: string];
  messageReactionRemove: [message: Message, userId: string, emoji: string];
  messageReactionRemoveEmoji: [message: Message, emoji: string];

  channelCreate: [channel: Channel];
  channelUpdate: [channel: Channel, previousChannel: HydratedChannel];
  channelDelete: [channel: HydratedChannel];
  channelGroupJoin: [channel: Channel, user: User];
  channelGroupLeave: [channel: Channel, user?: User];
  channelStartTyping: [channel: Channel, user?: User];
  channelStopTyping: [channel: Channel, user?: User];
  channelAcknowledged: [channel: Channel, messageId: string];

  serverCreate: [server: Server];
  serverUpdate: [server: Server, previousServer: HydratedServer];
  serverDelete: [server: HydratedServer];
  serverLeave: [server: HydratedServer];
  serverRoleUpdate: [server: Server, roleId: string, previousRole: Role];
  serverRoleDelete: [server: Server, roleId: string, role: Role];

  serverMemberUpdate: [
    member: ServerMember,
    previousMember: HydratedServerMember
  ];
  serverMemberJoin: [member: ServerMember];
  serverMemberLeave: [member: HydratedServerMember];

  userUpdate: [user: User, previousUser: HydratedUser];
  // ^ userRelationshipChanged: [user: User, previousRelationship: RelationshipStatus];
  // ^ userPresenceChanged: [user: User, previousPresence: boolean];
  userSettingsUpdate: [id: string, update: Record<string, [number, string]>];

  emojiCreate: [emoji: Emoji];
  emojiDelete: [emoji: HydratedEmoji];
};

/**
 * Client options object
 */
export type ClientOptions = Partial<EventClientOptions> & {
  /**
   * Base URL of the API server
   */
  baseURL: string;

  /**
   * Whether to allow partial objects to emit from events
   * @default false
   */
  partials: boolean;

  /**
   * Whether to eagerly fetch users and members for incoming events
   * @default true
   * @deprecated
   */
  eagerFetching: boolean;

  /**
   * Whether to automatically sync unreads information
   * @default false
   */
  syncUnreads: boolean;

  /**
   * Whether to reconnect when disconnected
   * @default true
   */
  autoReconnect: boolean;

  /**
   * Whether to rewrite sent messages that include identifiers such as @silent
   * @default true
   */
  messageRewrites: boolean;

  /**
   * Retry delay function
   * @param retryCount Count
   * @returns Delay in seconds
   * @default (2^x-1) ±20%
   */
  retryDelayFunction(retryCount: number): number;

  /**
   * Check whether a channel is muted
   * @param channel Channel
   * @return Whether it is muted
   * @default false
   */
  channelIsMuted(channel: Channel): boolean;
};

/**
 * upryzing.js Clients
 */
export class Client extends AsyncEventEmitter<Events> {
  readonly account;
  readonly bots;
  readonly channels;
  readonly channelUnreads;
  readonly channelWebhooks;
  readonly emojis;
  readonly messages;
  readonly servers;
  readonly serverMembers;
  readonly sessions;
  readonly users;

  readonly api: API;
  readonly options: ClientOptions;
  readonly events: EventClient<1>;

  configuration: RevoltConfig | undefined;
  #session: Session | undefined;
  user: User | undefined;

  readonly ready: Accessor<boolean>;
  #setReady: Setter<boolean>;

  readonly connectionFailureCount: Accessor<number>;
  #setConnectionFailureCount: Setter<number>;
  #reconnectTimeout: number | undefined;

  /**
   * Create an upryzing.js client
   */
  constructor(options?: Partial<ClientOptions>, configuration?: RevoltConfig) {
    super();

    this.options = {
      baseURL: "https://web.upryzing.app/api",
      partials: false,
      eagerFetching: true,
      syncUnreads: false,
      autoReconnect: true,
      messageRewrites: true,
      /**
       * Retry delay function
       * @param retryCount Count
       * @returns Delay in seconds
       */
      retryDelayFunction(retryCount) {
        return (Math.pow(2, retryCount) - 1) * (0.8 + Math.random() * 0.4);
      },
      /**
       * Check whether a channel is muted
       * @param channel Channel
       * @return Whether it is muted
       */
      channelIsMuted() {
        return false;
      },
      ...options,
    };

    this.configuration = configuration;

    this.api = new API({
      baseURL: this.options.baseURL,
    });

    const [ready, setReady] = createSignal(false);
    this.ready = ready;
    this.#setReady = setReady;

    const [connectionFailureCount, setConnectionFailureCount] = createSignal(0);
    this.connectionFailureCount = connectionFailureCount;
    this.#setConnectionFailureCount = setConnectionFailureCount;

    this.account = new AccountCollection(this);
    this.bots = new BotCollection(this);
    this.channels = new ChannelCollection(this);
    this.channelUnreads = new ChannelUnreadCollection(this);
    this.channelWebhooks = new ChannelWebhookCollection(this);
    this.emojis = new EmojiCollection(this);
    this.messages = new MessageCollection(this);
    this.servers = new ServerCollection(this);
    this.serverMembers = new ServerMemberCollection(this);
    this.sessions = new SessionCollection(this);
    this.users = new UserCollection(this);

    this.events = new EventClient(1, "json", this.options);
    this.events.on("error", (error) => this.emit("error", error));
    this.events.on("state", (state) => {
      switch (state) {
        case ConnectionState.Connected:
          batch(() => {
            this.servers.forEach((server) => server.resetSyncStatus());
            this.#setConnectionFailureCount(0);
            this.emit("connected");
          });
          break;
        case ConnectionState.Connecting:
          this.emit("connecting");
          break;
        case ConnectionState.Disconnected:
          this.emit("disconnected");
          if (this.options.autoReconnect) {
            this.#reconnectTimeout = setTimeout(
              () => this.connect(),
              this.options.retryDelayFunction(this.connectionFailureCount()) *
                1e3
            ) as never;

            this.#setConnectionFailureCount((count) => count + 1);
          }
          break;
      }
    });

    this.events.on("event", (event) =>
      handleEventV1(this, event, this.#setReady)
    );
  }

  /**
   * Current session id
   */
  get sessionId() {
    return typeof this.#session === "string" ? undefined : this.#session?._id;
  }

  /**
   * Get authentication header
   */
  get authenticationHeader() {
    return typeof this.#session === "string"
      ? ["X-Bot-Token", this.#session]
      : ["X-Session-Token", this.#session?.token as string];
  }

  /**
   * Connect to Revolt
   */
  connect() {
    clearTimeout(this.#reconnectTimeout);
    this.events.disconnect();
    this.#setReady(false);
    this.events.connect(
      this.configuration?.ws ?? "wss://web.upryzing.app/ws",
      typeof this.#session === "string" ? this.#session : this.#session!.token
    );
  }

  /**
   * Fetches the configuration of the server if it has not been already fetched.
   */
  async #fetchConfiguration() {
    if (!this.configuration) {
      this.configuration = await this.api.get("/");
    }
  }

  /**
   * Update API object to use authentication.
   */
  #updateHeaders() {
    (this.api as API) = new API({
      baseURL: this.options.baseURL,
      authentication: {
        revolt: this.#session,
      },
    });
  }

  /**
   * Log in with auth data, creating a new session in the process.
   * @param details Login data object
   * @returns An on-boarding function if on-boarding is required, undefined otherwise
   */
  async login(details: DataLogin) {
    await this.#fetchConfiguration();
    const data = await this.api.post("/auth/session/login", details);
    if (data.result === "Success") {
      this.#session = data;
      // TODO: return await this.connect();
    } else {
      throw "MFA not implemented!";
    }
  }

  /**
   * Use an existing session
   */
  async useExistingSession(session: Session) {
    this.#session = session;
    this.#updateHeaders();
  }

  /**
   * Log in as a bot
   * @param token Bot token
   */
  async loginBot(token: string) {
    await this.#fetchConfiguration();
    this.#session = token;
    this.#updateHeaders();
    this.connect();
  }

  /**
   * Prepare a markdown-based message to be displayed to the user as plain text.
   * @param source Source markdown text
   * @returns Modified plain text
   */
  markdownToText(source: string) {
    return source
      .replace(RE_MENTIONS, (sub: string, id: string) => {
        const user = this.users.get(id as string);

        if (user) {
          return `@${user.username}`;
        }

        return sub;
      })
      .replace(RE_CHANNELS, (sub: string, id: string) => {
        const channel = this.channels.get(id as string);

        if (channel) {
          return `#${channel.displayName}`;
        }

        return sub;
      })
      .replace(RE_SPOILER, "<spoiler>");
  }

  /**
   * Proxy a file through January.
   * @param url URL to proxy
   * @returns Proxied media URL
   */
  proxyFile(url: string): string | undefined {
    if (this.configuration?.features.january.enabled) {
      return `${
        this.configuration.features.january.url
      }/proxy?url=${encodeURIComponent(url)}`;
    } else {
      return url;
    }
  }
}
