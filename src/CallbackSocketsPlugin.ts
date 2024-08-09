import { ClassicPreset, ConnectionId, NodeEditor, NodeId, Root, Scope } from 'rete';
import { CallbackSocket } from './CallbackSocket';
import { CallbackSocketsScheme, Connection } from './types';

export type Side = 'input' | 'output';

export interface ConnectionRemovedEvent<Scheme extends CallbackSocketsScheme> {
  type: 'connectionremoved';
  connection: Scheme['Connection'];
}

export interface ConnectionAddedEvent<Scheme extends CallbackSocketsScheme> {
  type: 'connectioncreated';
  connection: Scheme['Connection'];
  otherSocket: ClassicPreset.Socket
}

export interface ConnectionChangedEvent<Scheme extends CallbackSocketsScheme> {
  type: 'connectionchanged';
  connection: Scheme['Connection'],
  otherSocket: ClassicPreset.Socket
}

export type ConnectionEvent<Scheme extends CallbackSocketsScheme> = ConnectionRemovedEvent<Scheme> | ConnectionAddedEvent<Scheme> | ConnectionChangedEvent<Scheme>;

export type NodeConnectionListener<Scheme extends CallbackSocketsScheme> = (
  event: ConnectionEvent<Scheme>
) => Promise<void> | void;

export interface NodeDependency<Scheme extends CallbackSocketsScheme> {
  addPortListener(side: Side, key: string, listener: NodeConnectionListener<Scheme>): void;
  removePortListener(side: Side, key: string, listener: NodeConnectionListener<Scheme>): void;
}

export class CallbackSocketsPlugin<
  Scheme extends CallbackSocketsScheme
> extends Scope<never, [Root<Scheme>]> {

  private editor!: NodeEditor<Scheme>;

  private readonly portListeners: Record<NodeId, Record<Side, Record<string, NodeConnectionListener<Scheme>[]>>> = {}

  constructor() {
    super('FormulaPlugin');
  }

  buildNodeDependency(nodeID: NodeId): NodeDependency<Scheme> {
    return {
      addPortListener: (side: Side, key: string, listener: NodeConnectionListener<Scheme>) => this.addPortListener(nodeID, side, key, listener),
      removePortListener: (side: Side, key: string, listener: NodeConnectionListener<Scheme>) => this.removePortListener(nodeID, side, key, listener),
    }
  }

  addPortListener(nodeID: NodeId, side: Side, key: string, listener: NodeConnectionListener<Scheme>): void {
    if (this.portListeners[nodeID] === undefined) {
      this.portListeners[nodeID] = { input: {}, output: {} };
    }
    if (this.portListeners[nodeID][side][key] === undefined) {
      this.portListeners[nodeID][side][key] = [];
    }
    this.portListeners[nodeID][side][key].push(listener);
  }

  removePortListener(nodeID: NodeId, side: Side, key: string, listener: NodeConnectionListener<Scheme>): void {
    const a: Record<string, NodeConnectionListener<Scheme>[]> = {};
    if (this.portListeners[nodeID] === undefined) {
      return;
    }
    if (this.portListeners[nodeID][side][key] === undefined) {
      return;
    }
    this.portListeners[nodeID][side][key] = this.portListeners[nodeID][side][key].filter(l => l != listener);
  }

  async updateSocket(nodeID: NodeId, side: Side, key: string, socket: ClassicPreset.Socket) {
    const node = this.editor.getNode(nodeID);
    let connections = [];
    if (side === 'input') {
      node.inputs[key]!.socket = socket;
      connections = this.editor.getConnections().filter(c => c.target === nodeID && c.targetInput === key);
    } else {
      node.outputs[key]!.socket = socket;
      connections = this.editor.getConnections().filter(c => c.target === nodeID && c.targetInput === key);
    }
    for (const connection of connections) {
      await this.recheckConnection(connection);
    }
    // refetch connections in case some got removed
    if (side === 'input') {
      node.inputs[key]!.socket = socket;
      connections = this.editor.getConnections().filter(c => c.target === nodeID && c.targetInput === key);
    } else {
      node.outputs[key]!.socket = socket;
      connections = this.editor.getConnections().filter(c => c.target === nodeID && c.targetInput === key);
    }
    for (const connection of connections) {
      if (side === 'input') {
        this.portListeners[connection.source]?.['output']?.[connection.sourceOutput].forEach(l => l({ type: 'connectionchanged', connection, otherSocket: socket }));
      } else {
        this.portListeners[connection.target]?.['input']?.[connection.targetInput].forEach(l => l({ type: 'connectionchanged', connection, otherSocket: socket }));
      }
    }
  }

  async recheckConnection(connection: Scheme['Connection']): Promise<void> {
    if(!this.isConnectionValid(connection)) {
      await this.editor.removeConnection(connection.id);
    }
  }

  private isConnectionValid(connection: Scheme['Connection']): boolean {
    const [outputSocket, inputSocket] = this.socketsByConnection(connection);
    return CallbackSocketsPlugin.compareSockets(outputSocket, inputSocket);
  }

  override setParent(scope: Scope<Root<Scheme>, []>): void {
    super.setParent(scope);
    this.editor = this.parentScope<NodeEditor<Scheme>>(NodeEditor<Scheme>);
    this.addPipe((context: Root<Scheme>) => {
      switch (context.type) {
        case 'connectioncreate':
          if(!this.isConnectionValid(context.data)) {
            const [outputSocket, inputSocket] = this.socketsByConnection(context.data);
            console.log('Sockets are incompatible!', outputSocket, inputSocket);
            return undefined;
          }
          break;
        case 'connectioncreated':
          const [outputSocket1, inputSocket1] = this.socketsByConnection(context.data);
          this.portListeners[context.data.source]?.['output']?.[context.data.sourceOutput].forEach(l => l({ type: 'connectioncreated', connection: context.data, otherSocket: inputSocket1 }));
          this.portListeners[context.data.target]?.['input']?.[context.data.targetInput].forEach(l => l({ type: 'connectioncreated', connection: context.data, otherSocket: outputSocket1 }));
          break;
        case 'connectionremoved':
          this.portListeners[context.data.source]?.['output']?.[context.data.sourceOutput].forEach(l => l({ type: 'connectionremoved', connection: context.data }));
          this.portListeners[context.data.target]?.['input']?.[context.data.targetInput].forEach(l => l({ type: 'connectionremoved', connection: context.data }));
          break;
      }
      return context;
    });
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
      if (!CallbackSocketsPlugin.compareSockets(outputSocket, inputSocket)) {
        await this.editor.removeConnection(connection.id);
      }
    }
  }

  private socketsByConnection(
    connection: Connection,
  ): [ClassicPreset.Socket, ClassicPreset.Socket] {
    const sourceNode = this.editor.getNode(connection.source);
    const targetNode = this.editor.getNode(connection.target);
    const output = sourceNode.outputs[connection.sourceOutput];
    const input = targetNode.inputs[connection.targetInput];

    return [output!.socket, input!.socket];
  }
}
