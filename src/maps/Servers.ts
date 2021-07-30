import type { Category, PermissionTuple, Role, Server as ServerI, SystemMessageChannels } from 'revolt-api/types/Servers';
import type { RemoveServerField, Route } from '../api/routes';
import type { Attachment } from 'revolt-api/types/Autumn';

import { makeAutoObservable, action, runInAction } from 'mobx';
import isEqual from 'lodash.isequal';

import { Nullable, toNullable } from '../util/null';
import Collection from './Collection';
import { User } from './Users';
import { Client } from '..';

export class Server {
    client: Client;

    _id: string;
    owner: string;
    name: string;
    description: Nullable<string> = null;

    channels: string[] = [];
    categories: Nullable<Category[]> = null;
    system_messages: Nullable<SystemMessageChannels> = null;

    roles: Nullable<{ [key: string]: Role }> = null;
    default_permissions: PermissionTuple;

    icon: Nullable<Attachment> = null;
    banner: Nullable<Attachment> = null;

    constructor(client: Client, data: ServerI) {
        this.client = client;
        
        this._id = data._id;
        this.owner = data.owner;
        this.name = data.name;
        this.description = toNullable(data.description);

        this.channels = data.channels;
        this.categories = toNullable(data.categories);
        this.system_messages = toNullable(data.system_messages);

        this.roles = toNullable(data.roles);
        this.default_permissions = data.default_permissions;

        this.icon = toNullable(data.icon);
        this.banner = toNullable(data.banner);

        makeAutoObservable(this, {
            _id: false,
            client: false,
        });
    }

    @action update(data: Partial<ServerI>, clear?: RemoveServerField) {
        const apply = (key: string) => {
            // This code has been tested.
            // @ts-expect-error
            if (data[key] && !isEqual(this[key], data[key])) {
                // @ts-expect-error
                this[key] = data[key];
            }
        };

        switch (clear) {
            case "Banner":
                this.banner = null;
                break;
            case "Description":
                this.description = null;
                break;
            case "Icon":
                this.icon = null;
                break;
        }

        apply("owner");
        apply("name");
        apply("description");
        apply("channels");
        apply("categories");
        apply("system_messages");
        apply("roles");
        apply("default_permissions");
        apply("icon");
        apply("banner");
    }

    /**
     * Create a channel
     * @param data Channel create route data
     * @returns The newly-created channel
     */
    async createChannel(data: Route<'POST', '/servers/id/channels'>["data"]) {
        return await this.client.req('POST', `/servers/${this._id}/channels` as '/servers/id/channels', data);
    }

    /**
     * Edit a server
     * @param data Server editing route data
     */
    async edit(data: Route<'PATCH', '/servers/id'>["data"]) {
        return await this.client.req('PATCH', `/servers/${this._id}` as '/servers/id', data);
    }

    /**
     * Delete a guild
     */
    async delete(avoidReq?: boolean) {
        if (!avoidReq)
            await this.client.req('DELETE', `/servers/${this._id}` as '/servers/id');

        runInAction(() => {
            this.client.servers.delete(this._id);
        });
    }

    /**
     * Ban user
     * @param user_id User ID
     */
    async banUser(user_id: string, data: Route<'PUT', '/servers/id/bans/id'>["data"]) {
        return await this.client.req('PUT', `/servers/${this._id}/bans/${user_id}` as '/servers/id/bans/id', data);
    }

    /**
     * Unban user
     * @param user_id User ID
     */
    async unbanUser(user_id: string) {
        return await this.client.req('DELETE', `/servers/${this._id}/bans/${user_id}` as '/servers/id/bans/id');
    }

    /**
     * Fetch a server's invites
     * @returns An array of the server's invites
     */
    async fetchInvites() {
        return await this.client.req('GET', `/servers/${this._id}/invites` as '/servers/id/invites');
    }

    /**
     * Fetch a server's bans
     * @returns An array of the server's bans.
     */
    async fetchBans() {
        return await this.client.req('GET', `/servers/${this._id}/bans` as '/servers/id/bans');
    }

    /**
     * Set role permissions
     * @param role_id Role Id, set to 'default' to affect all users
     * @param permissions Permission number, removes permission if unset
     */
    async setPermissions(role_id: string = 'default', permissions?: { server: number, channel: number }) {
        return await this.client.req('PUT', `/servers/${this._id}/permissions/${role_id}` as '/servers/id/permissions/id', { permissions });
    }

    /**
     * Create role
     * @param name Role name
     */
    async createRole(name: string) {
        return await this.client.req('POST', `/servers/${this._id}/roles` as '/servers/id/roles', { name });
    }

    /**
     * Edit a role
     * @param role_id Role ID
     * @param data Role editing route data
     */
    async editRole(role_id: string, data: Route<'PATCH', '/servers/id/roles/id'>["data"]) {
        return await this.client.req('PATCH', `/servers/${this._id}/roles/${role_id}` as '/servers/id/roles/id', data);
    }

    /**
     * Delete role
     * @param role_id Role ID
     */
    async deleteRole(role_id: string) {
        return await this.client.req('DELETE', `/servers/${this._id}/roles/${role_id}` as '/servers/id/roles/id');
    }

    /**
     * Fetch a server member
     * @param user User or User ID
     * @returns Server member object
     */
    async fetchMember(user: User | string) {
        return await this.client.req('GET', `/servers/${this._id}/members/${typeof user === 'string' ? user : user._id}` as '/servers/id/members/id');
    }

    /**
     * Fetch a server's members.
     * @returns An array of the server's members and their user objects.
     */
    async fetchMembers() {
        return await this.client.req('GET', `/servers/${this._id}/members` as '/servers/id/members');
    }
}

export default class Servers extends Collection<string, Server> {
    constructor(client: Client) {
        super(client);
        this.createObj = this.createObj.bind(this);
    }

    /**
     * Fetch a server
     * @param id Server ID
     * @returns The server
     */
    async fetch(id: string, data?: ServerI) {
        if (this.has(id)) return this.get(id)!;
        let res = data ?? await this.client.req('GET', `/servers/${id}` as '/servers/id');
        return this.createObj(res);
    }

    /**
     * Create a server object.
     * This is meant for internal use only.
     * @param data: Server Data
     * @returns Server
     */
    createObj(data: ServerI) {
        if (this.has(data._id)) return this.get(data._id)!;
        let server = new Server(this.client, data);

        runInAction(() => {
            this.set(data._id, server);
        });

        return server;
    }

    /**
     * Create a server
     * @param data Server create route data
     * @returns The newly-created server
     */
    async createServer(data: Route<'POST', '/servers/create'>["data"]) {
        let server = await this.client.req('POST', `/servers/create`, data);
        return this.fetch(server._id, server);
    }
}
