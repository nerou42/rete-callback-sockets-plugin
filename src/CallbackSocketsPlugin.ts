import { ClassicPreset, NodeEditor, NodeId, Root, Scope } from 'rete';
import { CallbackSocket } from './CallbackSocket';
import { CallbackSocketsScheme, Connection } from './types';

export type Side = 'input' | 'output';

type ElementTypes<T> = T[keyof T];

export interface ConnectionRemovedEvent {
  type: 'connectionremoved';
  connection: Connection;
}

export interface ConnectionAddedEvent<Socket extends ClassicPreset.Socket> {
  type: 'connectioncreated';
  connection: Connection;
  otherSocket: Socket
}

export interface ConnectionChangedEvent<Socket extends ClassicPreset.Socket> {
  type: 'connectionchanged';
  connection: Connection,
  otherSocket: Socket
}

export type ConnectionEvent<Socket extends ClassicPreset.Socket> = ConnectionRemovedEvent | ConnectionAddedEvent<Socket> | ConnectionChangedEvent<Socket>;

export type NodeConnectionListener<Socket extends ClassicPreset.Socket> = (
  event: ConnectionEvent<Socket>
) => Promise<void> | void;

export interface NodeDependency<Scheme extends CallbackSocketsScheme, Socket extends ClassicPreset.Socket> {
  addPortListener(node: Scheme['Node'], side: Side, key: string, listener: NodeConnectionListener<Socket>): void;
  removePortListener(node: Scheme['Node'], side: Side, key: string, listener: NodeConnectionListener<Socket>): void;
  addNodeListener(node: Scheme['Node'], listener: NodeConnectionListener<Socket>): void;
  removeNodeListener(node: Scheme['Node'], listener: NodeConnectionListener<Socket>): void;
  updateSocket(node: Scheme['Node'], side: Side, key: string, socket: Socket): Promise<void>;
}

export type SocketUpdatedListener<Scheme extends CallbackSocketsScheme, Socket extends ClassicPreset.Socket> = (node: Scheme['Node'], side: Side, key: string, socket: Socket) => void | Promise<void>;

export class CallbackSocketsPlugin<
  Scheme extends CallbackSocketsScheme,
  Socket extends ClassicPreset.Socket
> extends Scope<never, [Root<Scheme>]> implements NodeDependency<Scheme, Socket> {

  private editor!: NodeEditor<Scheme>;

  private readonly portListeners: Record<NodeId, Record<Side, Record<string, NodeConnectionListener<Socket>[]>>> = {}
  private readonly nodeListeners: Record<NodeId, NodeConnectionListener<Socket>[]> = {}

  private socketChangedListeners: SocketUpdatedListener<Scheme, Socket>[] = [];

  constructor() {
    super('CallbackSocketsPlugin');
  }

  addSocketChangedListeners(listener: SocketUpdatedListener<Scheme, Socket>) {
    this.socketChangedListeners.push(listener);
  }

  removeSocketChangedListeners(listener: SocketUpdatedListener<Scheme, Socket>) {
    this.socketChangedListeners = this.socketChangedListeners.filter(l => l !== listener);
  }

  addNodeListener(node: Scheme['Node'], listener: NodeConnectionListener<Socket>): void {
    if (this.nodeListeners[node.id] === undefined) {
      this.nodeListeners[node.id] = [];
    }
    this.nodeListeners[node.id].push(listener);
  }

  removeNodeListener(node: Scheme['Node'], listener: NodeConnectionListener<Socket>): void {
    if (this.nodeListeners[node.id] === undefined) {
      return
    }
    this.nodeListeners[node.id] = this.nodeListeners[node.id].filter(l => l != listener);
  }

  addPortListener(node: Scheme['Node'], side: Side, key: string, listener: NodeConnectionListener<Socket>): void {
    if (this.portListeners[node.id] === undefined) {
      this.portListeners[node.id] = { input: {}, output: {} };
    }
    if (this.portListeners[node.id][side][key] === undefined) {
      this.portListeners[node.id][side][key] = [];
    }
    this.portListeners[node.id][side][key].push(listener);
  }

  removePortListener(node: Scheme['Node'], side: Side, key: string, listener: NodeConnectionListener<Socket>): void {
    if (this.portListeners[node.id]?.[side]?.[key] === undefined) {
      return;
    }
    this.portListeners[node.id][side][key] = this.portListeners[node.id][side][key].filter(l => l != listener);
  }

  async updateSocket(node: Scheme['Node'], side: Side, key: string, socket: Socket): Promise<void> {
    let connections = [];
    if (side === 'input') {
      if (!node.hasInput(key)) {
        return;
      }
      if (typeof (node.inputs[key]!.socket as any)['updateSocket'] === 'function') {
        (node.inputs[key]!.socket as any)['updateSocket'](socket);
      } else {
        node.inputs[key]!.socket = socket;
      }
      for (const socketChangedListener of this.socketChangedListeners) {
        await socketChangedListener(node, side, key, socket);
      }
      connections = this.editor.getConnections().filter(c => c.target === node.id && c.targetInput === key);
    } else {
      if (!node.hasOutput(key)) {
        return;
      }
      if (typeof (node.outputs[key]!.socket as any)['updateSocket'] === 'function') {
        (node.outputs[key]!.socket as any)['updateSocket'](socket);
      } else {
        node.outputs[key]!.socket = socket;
      }
      connections = this.editor.getConnections().filter(c => c.source === node.id && c.sourceOutput === key);
    }
    for (const connection of connections) {
      await this.recheckConnection(connection);
    }
    // refetch connections in case some got removed
    if (side === 'input') {
      connections = this.editor.getConnections().filter(c => c.target === node.id && c.targetInput === key);
    } else {
      connections = this.editor.getConnections().filter(c => c.source === node.id && c.sourceOutput === key);
    }
    for (const connection of connections) {
      if (side === 'input') {
        await this.triggerEvent(connection.source, 'output', connection.sourceOutput, { type: 'connectionchanged', connection, otherSocket: socket });
      } else {
        await this.triggerEvent(connection.target, 'input', connection.targetInput, { type: 'connectionchanged', connection, otherSocket: socket });
      }
    }
  }

  async recheckConnection(connection: Scheme['Connection']): Promise<void> {
    if (!this.isConnectionValid(connection)) {
      await this.editor.removeConnection(connection.id);
    }
  }

  private isConnectionValid(connection: Scheme['Connection']): boolean {
    const [outputSocket, inputSocket] = this.socketsByConnection(connection);
    if(!outputSocket || !inputSocket) {
      return false;
    }
    return CallbackSocketsPlugin.compareSockets(outputSocket, inputSocket);
  }

  override setParent(scope: Scope<Root<Scheme>, []>): void {
    super.setParent(scope);
    this.editor = this.parentScope<NodeEditor<Scheme>>(NodeEditor<Scheme>);
    this.addPipe(async (context: Root<Scheme>) => {
      switch (context.type) {
        case 'connectioncreate':
          if (!this.isConnectionValid(context.data)) {
            const [outputSocket, inputSocket] = this.socketsByConnection(context.data);
            console.log('Sockets are incompatible!', outputSocket, inputSocket);
            return undefined;
          }
          break;
        case 'connectioncreated':
          const [outputSocket1, inputSocket1] = this.socketsByConnection(context.data);
          if(inputSocket1) {
            await this.triggerEvent(context.data.source, 'output', context.data.sourceOutput, { type: 'connectioncreated', connection: context.data, otherSocket: inputSocket1 });
          }
          if(outputSocket1) {
            await this.triggerEvent(context.data.target, 'input', context.data.targetInput, { type: 'connectioncreated', connection: context.data, otherSocket: outputSocket1 });
          }
          break;
        case 'connectionremoved':
          await this.triggerEvent(context.data.source, 'output', context.data.sourceOutput, { type: 'connectionremoved', connection: context.data });
          await this.triggerEvent(context.data.target, 'input', context.data.targetInput, { type: 'connectionremoved', connection: context.data });
          break;
      }
      return context;
    });
  }

  private async triggerEvent(nodeID: NodeId, side: Side, key: string, event: ConnectionEvent<Socket>): Promise<void> {
    if (this.nodeListeners[nodeID]) {
      for (const l of this.nodeListeners[nodeID]) {
        await l(event);
      }
    }
    if (this.portListeners[nodeID]?.[side]?.[key]) {
      for (const l of this.portListeners[nodeID]?.[side]?.[key]) {
        await l(event);
      }
    }
  }

  private static compareSockets(outputSocket: ClassicPreset.Socket, inputSocket: ClassicPreset.Socket): boolean {
    if ((outputSocket instanceof CallbackSocket) !== (outputSocket instanceof CallbackSocket)) {
      return false;
    }
    if (!(outputSocket instanceof CallbackSocket) || !(inputSocket instanceof CallbackSocket)) {
      return true;
    }
    return inputSocket.assignableBy(outputSocket);
  }

  async updateTypes(node: NodeId): Promise<void> {
    const connections = this.editor.getConnections().filter(c => c.source === node || c.target === node);
    for (const connection of connections) {
      const [outputSocket, inputSocket] = this.socketsByConnection(connection);
      if (!outputSocket || !inputSocket || !CallbackSocketsPlugin.compareSockets(outputSocket, inputSocket)) {
        await this.editor.removeConnection(connection.id);
      }
    }
  }

  private socketsByConnection(
    connection: Connection,
  ): [Socket | null, Socket | null] {
    const sourceNode = this.editor.getNode(connection.source);
    const targetNode = this.editor.getNode(connection.target);
    const output = sourceNode?.outputs[connection.sourceOutput];
    const input = targetNode?.inputs[connection.targetInput];

    return [(output?.socket ?? null) as Socket | null, (input?.socket ?? null) as Socket | null];
  }
}
