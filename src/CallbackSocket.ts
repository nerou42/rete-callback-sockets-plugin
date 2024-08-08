import { ClassicPreset } from 'rete';
import { TypeInterface } from './types';

export class CallbackSocket<
  T extends TypeInterface
> extends ClassicPreset.Socket {
  public readonly type: T;

  constructor(type: T) {
    super('AdvancedSocket');
    this.type = type;
  }

  assignableBy(socket: CallbackSocket<T>): boolean {
    return this.type.assignableBy(socket.type);
  }
}
