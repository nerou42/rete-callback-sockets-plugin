![NPM Version](https://img.shields.io/npm/v/rete-callback-sockets-plugin)
# Callback Sockets for Rete.js

A Rete.js plugin for advanced type checking through customizable socket comparison logic.

## Why?

Rete's default `Socket` compares by name only. This plugin provides `CallbackSocket` with custom type compatibility checking for sophisticated type validation.

## Installation

```bash
npm install rete-callback-sockets-plugin
```

## Quick Start

```typescript
import { CallbackSocketsPlugin } from 'rete-callback-sockets-plugin';

const socketsPlugin = new CallbackSocketsPlugin();
editor.use(socketsPlugin);
```

## Creating Sockets

```typescript
import { CallbackSocket } from 'rete-callback-sockets-plugin';

interface MyType {
  assignableBy(other: MyType): boolean;
}

const socket = new CallbackSocket(myType);
```

## Updating Sockets

**Important:** Always use the plugin to maintain connection validity.

```typescript
// ✅ Correct
await socketsPlugin.updateSocket(node, 'output', 'result', newSocket);

// ❌ Wrong - bypasses validation
node.outputs['result'].socket = newSocket;
```

## Removing Ports

```typescript
await socketsPlugin.removePort(node, 'input', 'value');
```

## Event Listeners

### Port Listeners

```typescript
socketsPlugin.addPortListener(node, 'input', 'value', async (event) => {
  switch (event.type) {
    case 'connectioncreated':
      console.log('Connected to:', event.otherSocket.type);
      break;
    case 'connectionremoved':
      console.log('Disconnected');
      break;
    case 'connectionchanged':
      console.log('Type changed:', event.otherSocket.type);
      break;
  }
});
```

### Node Listeners

```typescript
socketsPlugin.addNodeListener(node, async (event) => {
  console.log('Connection event:', event);
});
```

### Socket Change Listeners

```typescript
socketsPlugin.addSocketChangedListeners(async (node, side, key, newSocket) => {
  console.log(`${side}.${key} updated to:`, newSocket.type);
});
```

## Type Validation Control

```typescript
// Disable during bulk operations
socketsPlugin.disableTypeValidation();

// Re-enable and revalidate
socketsPlugin.enableTypeValidation();
await socketsPlugin.updateAllTypes();

// Revalidate specific node
await socketsPlugin.updateTypes(nodeId);
```

## Type Interface

Your types must implement `assignableBy`:

```typescript
interface TypeInterface {
  assignableBy(other: TypeInterface): boolean;
}

class NumberType implements TypeInterface {
  assignableBy(other: TypeInterface): boolean {
    return other instanceof NumberType;
  }
}

class AnyType implements TypeInterface {
  assignableBy(other: TypeInterface): boolean {
    return true;
  }
}
```

## Best Practices

- Always `await` async operations
- Use the plugin for all socket/port modifications

## License

MIT
