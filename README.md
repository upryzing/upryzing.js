# upryzing.js

![@upryzing/upryzing.js](https://img.shields.io/npm/v/@upryzing/upryzing.js) ![@upryzing/api](https://img.shields.io/npm/v/@upryzing/api)

**upryzing.js** is a JavaScript library for interacting with the entire Revolt API.

## Example Usage

```javascript
// esm / typescript
import { Client } from "@upryzing/upryzing.js";
// ...or commonjs
const { Client } = require("upryzing/upryzing.js");

let client = new Client();

client.on("ready", async () =>
  console.info(`Logged in as ${client.user.username}!`)
);

client.on("messageCreate", async (message) => {
  if (message.content === "hello") {
    message.channel.sendMessage("world");
  }
});

client.loginBot("..");
```

## Reactivity with Signals & Solid.js Primitives

All objects have reactivity built-in and can be dropped straight into any Solid.js project.

```tsx
const client = new Client();
// initialise the client

function MyApp() {
  return (
    <h1>Your username is: {client.user?.username ?? "[logging in...]"}</h1>
  );
}
```

## Upryzing API Types

> [!WARNING]
> It is advised that you **do not use this** unless necessary. If you find something that isn't covered by the library, please open an issue as this library aims to transform all objects.

All `@uprzying/api` types are re-exported from this library under the `API` object.

```typescript
import { API } from "@upryzing/upryzing.js";

// API.Channel;
// API.[..];
```
