import { ClassicPreset, GetSchemes } from 'rete';

export interface TypeInterface {
  assignableBy(socketType: TypeInterface): boolean;
}

export type Connection = ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>

export type CallbackSocketsScheme = GetSchemes<
  ClassicPreset.Node,
  Connection
>;
