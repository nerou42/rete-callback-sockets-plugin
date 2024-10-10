import { ClassicPreset } from 'rete';
import { TypeInterface } from './types';

export class CallbackSocket<
  T extends TypeInterface
> extends ClassicPreset.Socket {
  public readonly type: T;

  constructor(type: T) {
    super('AdvancedSocket');
    if(type === null || type === undefined) {
      console.log(type);
      throw new Error('Type cant be null or undefined');
    }
    this.type = type;
  }

  assignableBy(socket: CallbackSocket<T>): boolean {
    return this.type.assignableBy(socket.type);
  }
}
