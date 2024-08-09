import { ClassicPreset, GetSchemes } from 'rete';

export interface TypeInterface {
  assignableBy(socketType: TypeInterface): boolean;
}

export type Connection = ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>

export type CallbackSocketsScheme<Inputs extends {
  [key in string]?: ClassicPreset.Socket;
} = {
    [key in string]?: ClassicPreset.Socket;
  }, Outputs extends {
    [key in string]?: ClassicPreset.Socket;
  } = {
    [key in string]?: ClassicPreset.Socket;
  }> = GetSchemes<
    ClassicPreset.Node<Inputs, Outputs>,
    Connection
  >;
