import { ClassicPreset, NodeEditor, NodeId, Root, Scope } from 'rete';
import { CallbackSocket } from './CallbackSocket';
import { CallbackSocketsScheme, Connection } from './types';

export class CallbackSocketsPlugin<
  Scheme extends CallbackSocketsScheme
> extends Scope<never, [Root<Scheme>]> {

  private editor!: NodeEditor<Scheme>;

  constructor() {
    super('FormulaPlugin');
  }

  override setParent(scope: Scope<Root<Scheme>, []>): void {
    super.setParent(scope);
    this.editor = this.parentScope<NodeEditor<Scheme>>(NodeEditor<Scheme>);
    this.addPipe((context: Root<Scheme>) => {
      switch (context.type) {
        case 'connectioncreate':
          const [outputSocket, inputSocket] = this.socketsByConnection(context.data);
          if (CallbackSocketsPlugin.compareSockets(outputSocket, inputSocket)) {
            return context;
          } else {
            return undefined;
          }
      }
      return context;
    });
  }

  private static compareSockets(outputSocket: ClassicPreset.Socket | undefined, inputSocket: ClassicPreset.Socket | undefined): boolean {
    if (outputSocket instanceof CallbackSocket !== outputSocket instanceof CallbackSocket) {
      return false;
    }
    if (!(outputSocket instanceof CallbackSocket) || !(inputSocket instanceof CallbackSocket)) {
      return true;
    }
    return outputSocket.assignableBy(inputSocket);
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
  ): [ClassicPreset.Socket | undefined, ClassicPreset.Socket | undefined] {
    const sourceNode = this.editor.getNode(connection.source);
    const targetNode = this.editor.getNode(connection.target);
    const output = sourceNode.outputs[connection.sourceOutput];
    const input = targetNode.inputs[connection.targetInput];

    return [output?.socket, input?.socket];
  }
}
