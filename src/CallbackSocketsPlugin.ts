import { ClassicPreset, NodeEditor, Root, Scope } from 'rete';
import { CallbackSocket } from './CallbackSocket';
import { CallbackSocketsScheme, Connection, TypeInterface } from './types';

export class CallbackSocketsPlugin<
  T extends TypeInterface,
  Scheme extends CallbackSocketsScheme
> extends Scope<never, [Root<Scheme>]> {
  constructor() {
    super('FormulaPlugin');
  }

  override setParent(scope: Scope<Root<Scheme>, []>): void {
    super.setParent(scope);
    const editor = this.parentScope<NodeEditor<Scheme>>(NodeEditor<Scheme>);
    this.addPipe((context: Root<Scheme>) => {
      switch (context.type) {
        case 'connectioncreate':
          const [outputSocket, inputSocket] = this.socketsByConnection(
            context.data,
            editor
          );
          if(outputSocket instanceof CallbackSocket !== inputSocket instanceof CallbackSocket) {
            return undefined;
          }
          if (
            !(outputSocket instanceof CallbackSocket) ||
            !(inputSocket instanceof CallbackSocket)
          ) {
            return context;
          }
          if (!outputSocket.assignableBy(inputSocket)) {
            return undefined;
          }
          break;
      }
      return context;
    });
  }

  private socketsByConnection(
    connection: Connection,
    editor: NodeEditor<Scheme>
  ): [ClassicPreset.Socket | undefined, ClassicPreset.Socket | undefined] {
    const sourceNode = editor.getNode(connection.source);
    const targetNode = editor.getNode(connection.target);
    const output = sourceNode.outputs[connection.sourceOutput];
    const input = targetNode.inputs[connection.targetInput];

    return [output?.socket, input?.socket];
  }
}
